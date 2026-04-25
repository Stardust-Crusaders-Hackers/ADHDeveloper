plugins {
    kotlin("jvm") version "1.8.22"
    id("org.jetbrains.intellij") version "1.13.3"
}

group = "com.example"
version = "0.1.0"

repositories { mavenCentral() }

sourceSets {
    main {
        resources.srcDirs("resources")
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions.jvmTarget = "17"
}

dependencies {
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.15.2")
    implementation("com.googlecode.soundlibs:mp3spi:1.9.5.4")
}

intellij {
    version.set("2023.3")
    type.set("IC")
    plugins.set(listOf("java"))
    pluginName.set("mcpassistant")
}

tasks {
    wrapper {
        gradleVersion = "8.3"
    }
    patchPluginXml {
        sinceBuild.set("233")
        untilBuild.set("243.*")
    }
}
