package com.example.mcpassistant.model

data class AgentTask(
    val taskId: String,
    val agentId: String,
    val description: String,
    val status: TaskStatus,
    val result: String = ""
)

enum class TaskStatus { ACTIVE, COMPLETED, FAILED }
