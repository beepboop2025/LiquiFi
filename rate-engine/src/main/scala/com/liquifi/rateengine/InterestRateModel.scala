package com.liquifi.rateengine

import spray.json._
import spray.json.DefaultJsonProtocol._
import scala.util.Random

/**
 * Interest rate models: Vasicek and Cox-Ingersoll-Ross (CIR).
 * Used for simulating future interest rate paths and pricing derivatives.
 */
class InterestRateModel {

  private val rng = new Random(42)

  /**
   * Simulate interest rate paths using the Vasicek model.
   *
   * dr = κ(θ - r)dt + σdW
   *
   * @param r0    Initial rate
   * @param kappa Mean reversion speed
   * @param theta Long-term mean rate
   * @param sigma Volatility
   * @param dt    Time step (e.g., 1/252 for daily)
   * @param steps Number of time steps
   * @param paths Number of simulation paths
   */
  def simulateVasicek(
    r0: Double, kappa: Double, theta: Double, sigma: Double,
    dt: Double, steps: Int, paths: Int
  ): Map[String, Any] = {
    val allPaths = Array.ofDim[Double](paths, steps + 1)

    for (p <- 0 until paths) {
      allPaths(p)(0) = r0
      for (t <- 1 to steps) {
        val dW = rng.nextGaussian() * math.sqrt(dt)
        allPaths(p)(t) = allPaths(p)(t - 1) + kappa * (theta - allPaths(p)(t - 1)) * dt + sigma * dW
      }
    }

    summarizePaths(allPaths, steps, paths, "vasicek", dt)
  }

  /**
   * Simulate interest rate paths using the CIR model.
   *
   * dr = κ(θ - r)dt + σ√r dW
   *
   * CIR ensures non-negative rates when 2κθ ≥ σ² (Feller condition).
   */
  def simulateCIR(
    r0: Double, kappa: Double, theta: Double, sigma: Double,
    dt: Double, steps: Int, paths: Int
  ): Map[String, Any] = {
    val allPaths = Array.ofDim[Double](paths, steps + 1)

    for (p <- 0 until paths) {
      allPaths(p)(0) = math.max(r0, 0.0001)
      for (t <- 1 to steps) {
        val r = allPaths(p)(t - 1)
        val dW = rng.nextGaussian() * math.sqrt(dt)
        val drift = kappa * (theta - r) * dt
        val diffusion = sigma * math.sqrt(math.max(r, 0)) * dW
        allPaths(p)(t) = math.max(r + drift + diffusion, 0.0001)  // Ensure non-negative
      }
    }

    val fellerCondition = 2 * kappa * theta >= sigma * sigma
    val result = summarizePaths(allPaths, steps, paths, "cir", dt)
    result + ("feller_condition_met" -> fellerCondition)
  }

  private def summarizePaths(
    allPaths: Array[Array[Double]], steps: Int, numPaths: Int,
    model: String, dt: Double
  ): Map[String, Any] = {
    // Compute percentiles at each time step
    val timePoints = (0 to steps by math.max(1, steps / 50)).toArray  // ~50 sample points
    val meanPath = new Array[Double](timePoints.length)
    val p5Path = new Array[Double](timePoints.length)
    val p25Path = new Array[Double](timePoints.length)
    val p75Path = new Array[Double](timePoints.length)
    val p95Path = new Array[Double](timePoints.length)

    for ((t, idx) <- timePoints.zipWithIndex) {
      val values = (0 until numPaths).map(p => allPaths(p)(t)).sorted.toArray
      meanPath(idx) = values.sum / numPaths
      p5Path(idx) = values((numPaths * 0.05).toInt)
      p25Path(idx) = values((numPaths * 0.25).toInt)
      p75Path(idx) = values((numPaths * 0.75).toInt)
      p95Path(idx) = values((numPaths * 0.95).toInt)
    }

    // Terminal distribution
    val terminalValues = (0 until numPaths).map(p => allPaths(p)(steps)).toArray
    val terminalMean = terminalValues.sum / numPaths
    val terminalStd = math.sqrt(terminalValues.map(v => (v - terminalMean) * (v - terminalMean)).sum / (numPaths - 1))

    Map(
      "model" -> model,
      "paths" -> numPaths,
      "steps" -> steps,
      "dt" -> dt,
      "time_points" -> timePoints.map(_ * dt).toList,
      "mean" -> meanPath.map(v => BigDecimal(v).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble).toList,
      "p5" -> p5Path.map(v => BigDecimal(v).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble).toList,
      "p25" -> p25Path.map(v => BigDecimal(v).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble).toList,
      "p75" -> p75Path.map(v => BigDecimal(v).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble).toList,
      "p95" -> p95Path.map(v => BigDecimal(v).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble).toList,
      "terminal" -> Map(
        "mean" -> BigDecimal(terminalMean).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble,
        "std" -> BigDecimal(terminalStd).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble,
        "min" -> BigDecimal(terminalValues.min).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble,
        "max" -> BigDecimal(terminalValues.max).setScale(6, BigDecimal.RoundingMode.HALF_UP).toDouble
      )
    )
  }
}
