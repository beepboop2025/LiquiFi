package com.liquifi.rateengine

import org.apache.commons.math3.optim.nonlinear.scalar.GoalType
import org.apache.commons.math3.optim.nonlinear.scalar.ObjectiveFunction
import org.apache.commons.math3.optim.{MaxEval, InitialGuess, SimpleBounds}
import org.apache.commons.math3.optim.nonlinear.scalar.noderiv.BOBYQAOptimizer
import spray.json._
import spray.json.DefaultJsonProtocol._

/**
 * Nelson-Siegel yield curve fitting and interpolation.
 *
 * The Nelson-Siegel model parameterizes the yield curve as:
 *   y(t) = β0 + β1 * (1 - e^(-t/λ)) / (t/λ) + β2 * ((1 - e^(-t/λ)) / (t/λ) - e^(-t/λ))
 *
 * Where:
 *   β0 = long-term rate level
 *   β1 = short-term component (slope)
 *   β2 = medium-term component (curvature)
 *   λ  = decay factor
 */
class YieldCurveService {

  /** Nelson-Siegel yield at maturity t */
  def nelsonSiegelYield(beta0: Double, beta1: Double, beta2: Double, lambda: Double, t: Double): Double = {
    if (t <= 0) return beta0 + beta1
    val tl = t / lambda
    val expTl = math.exp(-tl)
    val factor = (1.0 - expTl) / tl
    beta0 + beta1 * factor + beta2 * (factor - expTl)
  }

  /** Interpolate yield at a given maturity using fitted parameters */
  def interpolate(beta0: Double, beta1: Double, beta2: Double, lambda: Double, maturity: Double): Double = {
    nelsonSiegelYield(beta0, beta1, beta2, lambda, maturity)
  }

  /** Fit Nelson-Siegel parameters to observed yield data using BOBYQA optimization */
  def fitNelsonSiegel(maturities: Array[Double], observedYields: Array[Double]): Map[String, Any] = {
    require(maturities.length == observedYields.length, "Maturities and yields must have same length")
    require(maturities.length >= 4, "Need at least 4 data points to fit Nelson-Siegel")

    val n = maturities.length

    // Objective: minimize sum of squared errors
    val objective = new ObjectiveFunction((params: Array[Double]) => {
      val b0 = params(0); val b1 = params(1); val b2 = params(2); val lam = params(3)
      var sse = 0.0
      for (i <- 0 until n) {
        val predicted = nelsonSiegelYield(b0, b1, b2, lam, maturities(i))
        val err = predicted - observedYields(i)
        sse += err * err
      }
      sse
    })

    val optimizer = new BOBYQAOptimizer(9)
    val initialGuess = new InitialGuess(Array(
      observedYields.last,  // β0 ≈ long-term rate
      observedYields.head - observedYields.last,  // β1 ≈ slope
      0.0,  // β2
      1.5   // λ
    ))
    val bounds = new SimpleBounds(
      Array(-10, -20, -20, 0.01),  // lower
      Array(30, 20, 20, 30)        // upper
    )

    try {
      val result = optimizer.optimize(
        objective, GoalType.MINIMIZE, initialGuess, bounds, new MaxEval(10000)
      )
      val params = result.getPoint
      val fittedYields = maturities.map(t => nelsonSiegelYield(params(0), params(1), params(2), params(3), t))
      val residuals = observedYields.zip(fittedYields).map { case (obs, fit) => obs - fit }
      val rmse = math.sqrt(residuals.map(r => r * r).sum / n)

      Map(
        "params" -> Map("beta0" -> params(0), "beta1" -> params(1), "beta2" -> params(2), "lambda" -> params(3)),
        "fitted_yields" -> maturities.zip(fittedYields).map { case (m, y) => Map("maturity" -> m, "yield" -> y) },
        "rmse" -> rmse,
        "residuals" -> residuals.toList
      )
    } catch {
      case e: Exception =>
        Map("error" -> e.getMessage)
    }
  }
}
