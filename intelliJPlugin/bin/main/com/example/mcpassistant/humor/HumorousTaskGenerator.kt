package com.example.mcpassistant.humor

import com.example.mcpassistant.model.AgentTask

object HumorousTaskGenerator {
    private val openers = listOf(
        "Reluctantly agrees to",
        "With great sighing,",
        "Confidently misinterprets",
        "Heroically attempts to",
        "Pretends to understand",
        "Aggressively Googles how to",
        "Copies from Stack Overflow to",
    )
    private val closers = listOf(
        "(results may vary)",
        "(coffee not included)",
        "(blame the PM)",
        "(Stack Overflow was down)",
        "(LGTM, ship it)",
        "(my code, my rules)",
        "(technically it works)",
    )

    fun generate(task: AgentTask): String =
        "${openers.random()} ${task.description.lowercase()} ${closers.random()}"
}
