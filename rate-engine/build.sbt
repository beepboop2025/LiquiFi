name := "liquifi-rate-engine"
version := "1.0.0"
scalaVersion := "3.4.2"

libraryDependencies ++= Seq(
  // Akka HTTP
  "com.typesafe.akka" %% "akka-http" % "10.6.3" cross CrossVersion.for3Use2_13,
  "com.typesafe.akka" %% "akka-http-spray-json" % "10.6.3" cross CrossVersion.for3Use2_13,
  "com.typesafe.akka" %% "akka-actor-typed" % "2.9.3" cross CrossVersion.for3Use2_13,
  "com.typesafe.akka" %% "akka-stream" % "2.9.3" cross CrossVersion.for3Use2_13,
  // JSON
  "io.spray" %% "spray-json" % "1.3.6" cross CrossVersion.for3Use2_13,
  // Math
  "org.apache.commons" % "commons-math3" % "3.6.1",
  // Logging
  "ch.qos.logback" % "logback-classic" % "1.5.11",
  // Testing
  "org.scalatest" %% "scalatest" % "3.2.19" % Test,
)

// Assembly plugin for fat JAR
assembly / mainClass := Some("com.liquifi.rateengine.Main")
assembly / assemblyMergeStrategy := {
  case PathList("META-INF", _*) => MergeStrategy.discard
  case "reference.conf" => MergeStrategy.concat
  case _ => MergeStrategy.first
}
