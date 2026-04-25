plugins {
    kotlin("jvm") version "2.1.0"
    id("org.jetbrains.intellij.platform") version "2.3.0"
}

group = "com.example"
version = "0.1.0"

repositories {
    mavenCentral()
    intellijPlatform {
        defaultRepositories()
    }
}

sourceSets {
    main {
        resources.srcDirs("resources")
    }
}

java {
    sourceCompatibility = JavaVersion.VERSION_21
    targetCompatibility = JavaVersion.VERSION_21
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    kotlinOptions.jvmTarget = "21"
}

dependencies {
    intellijPlatform {
        intellijIdeaCommunity("2025.1")
        bundledPlugin("com.intellij.java")
        instrumentationTools()
    }
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin:2.15.2")
    implementation("com.googlecode.soundlibs:mp3spi:1.9.5.4")
}

intellijPlatform {
    pluginConfiguration {
        name = "ADHDeveloper Stage Mode"
        version = "0.1.0"
        ideaVersion {
            sinceBuild = "251"
            untilBuild = "253.*"
        }
    }
}

tasks {
    wrapper {
        gradleVersion = "8.8"
    }
    processResources {
        duplicatesStrategy = DuplicatesStrategy.EXCLUDE
    }
}
