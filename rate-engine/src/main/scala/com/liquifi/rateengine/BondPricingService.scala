package com.liquifi.rateengine

import spray.json._
import spray.json.DefaultJsonProtocol._

/**
 * Bond pricing, duration, and convexity calculations.
 * Supports standard fixed-rate bonds with semi-annual or other coupon frequencies.
 */
class BondPricingService {

  /**
   * Price a fixed-rate bond using discounted cash flow.
   *
   * @param faceValue     Par value of the bond
   * @param couponRate    Annual coupon rate (e.g., 0.05 for 5%)
   * @param yieldToMaturity Annual yield to maturity
   * @param maturityYears Time to maturity in years
   * @param frequency     Coupon payments per year (1=annual, 2=semi-annual, 4=quarterly)
   */
  def priceBond(
    faceValue: Double,
    couponRate: Double,
    yieldToMaturity: Double,
    maturityYears: Double,
    frequency: Int = 2
  ): Map[String, Any] = {
    val periods = (maturityYears * frequency).toInt
    val couponPayment = faceValue * couponRate / frequency
    val periodYield = yieldToMaturity / frequency

    var price = 0.0
    val cashflows = new Array[(Double, Double)](periods + 1)

    for (i <- 1 to periods) {
      val cf = if (i == periods) couponPayment + faceValue else couponPayment
      val pv = cf / math.pow(1 + periodYield, i)
      price += pv
      cashflows(i) = (i.toDouble / frequency, cf)
    }

    val accrued = couponPayment * 0  // Assume clean price at coupon date
    val dirtyPrice = price + accrued

    Map(
      "clean_price" -> BigDecimal(price).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "dirty_price" -> BigDecimal(dirtyPrice).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "face_value" -> faceValue,
      "coupon_rate" -> couponRate,
      "ytm" -> yieldToMaturity,
      "maturity_years" -> maturityYears,
      "periods" -> periods,
      "coupon_payment" -> BigDecimal(couponPayment).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "premium_discount" -> (if (price > faceValue) "premium" else if (price < faceValue) "discount" else "par")
    )
  }

  /**
   * Compute Macaulay duration, modified duration, and convexity.
   */
  def computeDurationConvexity(
    faceValue: Double,
    couponRate: Double,
    yieldToMaturity: Double,
    maturityYears: Double,
    frequency: Int = 2
  ): Map[String, Any] = {
    val periods = (maturityYears * frequency).toInt
    val couponPayment = faceValue * couponRate / frequency
    val periodYield = yieldToMaturity / frequency

    var price = 0.0
    var macDuration = 0.0
    var convexity = 0.0

    for (i <- 1 to periods) {
      val cf = if (i == periods) couponPayment + faceValue else couponPayment
      val df = math.pow(1 + periodYield, i)
      val pv = cf / df
      price += pv
      macDuration += i * pv
      convexity += i * (i + 1) * pv
    }

    macDuration = macDuration / price / frequency  // Convert to years
    val modDuration = macDuration / (1 + periodYield)
    convexity = convexity / (price * frequency * frequency * math.pow(1 + periodYield, 2))

    // Dollar duration (DV01): price change for 1bp yield change
    val dv01 = modDuration * price / 10000

    Map(
      "macaulay_duration" -> BigDecimal(macDuration).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "modified_duration" -> BigDecimal(modDuration).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "convexity" -> BigDecimal(convexity).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "dv01" -> BigDecimal(dv01).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble,
      "price" -> BigDecimal(price).setScale(4, BigDecimal.RoundingMode.HALF_UP).toDouble
    )
  }
}
