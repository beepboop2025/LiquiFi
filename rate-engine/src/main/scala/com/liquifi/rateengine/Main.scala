package com.liquifi.rateengine

import akka.actor.typed.ActorSystem
import akka.actor.typed.scaladsl.Behaviors
import akka.http.scaladsl.Http
import akka.http.scaladsl.server.Directives._
import akka.http.scaladsl.marshallers.sprayjson.SprayJsonSupport._
import spray.json.DefaultJsonProtocol._
import spray.json._

import scala.concurrent.ExecutionContextExecutor
import scala.io.StdIn

object Main {

  implicit val system: ActorSystem[Nothing] = ActorSystem(Behaviors.empty, "rate-engine")
  implicit val ec: ExecutionContextExecutor = system.executionContext

  private val yieldCurveService = new YieldCurveService()
  private val bondPricingService = new BondPricingService()
  private val interestRateModel = new InterestRateModel()

  val routes = concat(
    path("health") {
      get {
        complete(JsObject("status" -> JsString("ok"), "service" -> JsString("rate-engine")))
      }
    },

    path("yield-curve" / "fit") {
      post {
        entity(as[JsValue]) { json =>
          val maturities = json.asJsObject.fields("maturities").convertTo[Array[Double]]
          val yields = json.asJsObject.fields("yields").convertTo[Array[Double]]
          val result = yieldCurveService.fitNelsonSiegel(maturities, yields)
          complete(result.toJson)
        }
      }
    },

    path("yield-curve" / "interpolate") {
      post {
        entity(as[JsValue]) { json =>
          val params = json.asJsObject.fields("params").convertTo[Map[String, Double]]
          val maturity = json.asJsObject.fields("maturity").convertTo[Double]
          val rate = yieldCurveService.interpolate(
            params("beta0"), params("beta1"), params("beta2"), params("lambda"), maturity
          )
          complete(JsObject("maturity" -> JsNumber(maturity), "rate" -> JsNumber(rate)))
        }
      }
    },

    path("bond" / "price") {
      post {
        entity(as[JsValue]) { json =>
          val fields = json.asJsObject.fields
          val result = bondPricingService.priceBond(
            faceValue = fields("face_value").convertTo[Double],
            couponRate = fields("coupon_rate").convertTo[Double],
            yieldToMaturity = fields("ytm").convertTo[Double],
            maturityYears = fields("maturity_years").convertTo[Double],
            frequency = fields.get("frequency").map(_.convertTo[Int]).getOrElse(2)
          )
          complete(result.toJson)
        }
      }
    },

    path("bond" / "duration") {
      post {
        entity(as[JsValue]) { json =>
          val fields = json.asJsObject.fields
          val result = bondPricingService.computeDurationConvexity(
            faceValue = fields("face_value").convertTo[Double],
            couponRate = fields("coupon_rate").convertTo[Double],
            yieldToMaturity = fields("ytm").convertTo[Double],
            maturityYears = fields("maturity_years").convertTo[Double],
            frequency = fields.get("frequency").map(_.convertTo[Int]).getOrElse(2)
          )
          complete(result.toJson)
        }
      }
    },

    path("rates" / "simulate") {
      post {
        entity(as[JsValue]) { json =>
          val fields = json.asJsObject.fields
          val model = fields.get("model").map(_.convertTo[String]).getOrElse("vasicek")
          val paths = fields.get("paths").map(_.convertTo[Int]).getOrElse(1000)
          val steps = fields.get("steps").map(_.convertTo[Int]).getOrElse(252)
          val r0 = fields("r0").convertTo[Double]
          val kappa = fields("kappa").convertTo[Double]
          val theta = fields("theta").convertTo[Double]
          val sigma = fields("sigma").convertTo[Double]
          val dt = fields.get("dt").map(_.convertTo[Double]).getOrElse(1.0 / 252)

          val result = model match {
            case "cir" => interestRateModel.simulateCIR(r0, kappa, theta, sigma, dt, steps, paths)
            case _ => interestRateModel.simulateVasicek(r0, kappa, theta, sigma, dt, steps, paths)
          }
          complete(result.toJson)
        }
      }
    }
  )

  def main(args: Array[String]): Unit = {
    val port = sys.env.getOrElse("PORT", "9090").toInt
    val bindingFuture = Http().newServerAt("0.0.0.0", port).bind(routes)
    println(s"LiquiFi Rate Engine running at http://0.0.0.0:$port")
  }
}
