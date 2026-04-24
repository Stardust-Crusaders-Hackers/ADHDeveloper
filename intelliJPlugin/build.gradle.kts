plugins {
    kotlin("jvm") version "1.8.22"
    id("org.jetbrains.intellij") version "1.13.3"
}

group = "com.example"
version = "0.1.0"

repositories { mavenCentral() }

intellij {
    version.set("2023.3")
    type.set("IC")
    plugins.set(listOf("java"))
}

tasks {
    wrapper {
        gradleVersion = "8.3"
    }
}
