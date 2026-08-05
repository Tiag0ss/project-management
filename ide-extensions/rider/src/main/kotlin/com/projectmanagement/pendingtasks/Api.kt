package com.projectmanagement.pendingtasks

import java.net.URI
import java.net.http.HttpClient
import java.net.http.HttpRequest
import java.net.http.HttpResponse
import java.time.Duration
import java.time.LocalDate
import com.google.gson.Gson
import com.google.gson.annotations.SerializedName

data class PmTask(
    @SerializedName("Id") val id: Int = 0,
    @SerializedName("ProjectId") val projectId: Int = 0,
    @SerializedName("OrganizationId") val organizationId: Int = 0,
    @SerializedName("ProjectName") val projectName: String? = null,
    @SerializedName("TaskName") val taskName: String = "",
    @SerializedName("Description") val description: String? = null,
    @SerializedName("Status") val statusId: Int = 0,
    @SerializedName("StatusName") val statusName: String? = null,
    @SerializedName("StatusIsClosed") val statusIsClosed: Int = 0,
    @SerializedName("StatusIsCancelled") val statusIsCancelled: Int = 0,
    @SerializedName("StatusIsInProgress") val statusIsInProgress: Int = 0,
    @SerializedName("StatusHideFromPlanningAndStatistics") val statusHide: Int = 0,
    @SerializedName("PriorityName") val priorityName: String? = null,
    @SerializedName("PriorityColor") val priorityColor: String? = null,
    @SerializedName("PrioritySortOrder") val prioritySortOrder: Int? = null,
    @SerializedName("DisplayOrder") val displayOrder: Int? = null,
    @SerializedName("DueDate") val dueDate: String? = null,
)

data class PmStatusValue(
    @SerializedName("Id") val id: Int = 0,
    @SerializedName("StatusName") val statusName: String = "",
    @SerializedName("SortOrder") val sortOrder: Int? = null,
    @SerializedName("IsClosed") val isClosed: Int = 0,
    @SerializedName("IsCancelled") val isCancelled: Int = 0,
    @SerializedName("IsInProgress") val isInProgress: Int = 0,
)

data class MyTasksResponse(
    val success: Boolean? = null,
    val tasks: List<PmTask>? = null,
)

data class StatusValuesResponse(
    val success: Boolean? = null,
    val statuses: List<PmStatusValue>? = null,
)

data class ProfileResponse(
    val username: String? = null,
    val Username: String? = null,
    val email: String? = null,
    val Email: String? = null,
)

object TaskRules {
    fun isPending(task: PmTask): Boolean =
        task.statusIsClosed != 1 && task.statusIsCancelled != 1 && task.statusHide != 1

    private fun dueEpochDay(due: String?): Long? {
        if (due.isNullOrBlank()) return null
        return try {
            LocalDate.parse(due.take(10)).toEpochDay()
        } catch (_: Exception) {
            null
        }
    }

    fun compare(a: PmTask, b: PmTask): Int {
        val today = LocalDate.now().toEpochDay()
        val aDue = dueEpochDay(a.dueDate)
        val bDue = dueEpochDay(b.dueDate)
        val aOverdue = if (aDue != null && aDue < today) 0 else 1
        val bOverdue = if (bDue != null && bDue < today) 0 else 1
        if (aOverdue != bOverdue) return aOverdue - bOverdue
        if (aDue == null && bDue != null) return 1
        if (aDue != null && bDue == null) return -1
        if (aDue != null && bDue != null && aDue != bDue) return (aDue - bDue).toInt()
        val aPri = a.prioritySortOrder ?: 9999
        val bPri = b.prioritySortOrder ?: 9999
        if (aPri != bPri) return aPri - bPri
        return a.taskName.compareTo(b.taskName, ignoreCase = true)
    }

    fun groupByProject(tasks: List<PmTask>): Map<String, List<PmTask>> =
        tasks.groupBy { it.projectName?.trim().orEmpty().ifEmpty { "Project #${it.projectId}" } }
            .toSortedMap(String.CASE_INSENSITIVE_ORDER)
            .mapValues { (_, list) -> list.sortedWith(::compare) }
}

object PmApi {
    private val gson = Gson()
    private val client = HttpClient.newBuilder()
        .connectTimeout(Duration.ofSeconds(15))
        .build()

    private fun request(
        baseUrl: String,
        token: String,
        path: String,
        method: String = "GET",
        jsonBody: String? = null
    ): String {
        val url = baseUrl.trimEnd('/') + path
        val builder = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(Duration.ofSeconds(30))
            .header("Authorization", "Bearer $token")
            .header("Accept", "application/json")
        if (jsonBody != null) {
            builder.header("Content-Type", "application/json")
            builder.method(method, HttpRequest.BodyPublishers.ofString(jsonBody))
        } else {
            builder.method(method, HttpRequest.BodyPublishers.noBody())
        }
        val res = client.send(builder.build(), HttpResponse.BodyHandlers.ofString())
        if (res.statusCode() == 401 || res.statusCode() == 403) {
            throw IllegalStateException("Unauthorized — check your API token (pt_…) or permissions")
        }
        if (res.statusCode() !in 200..299) {
            throw IllegalStateException("HTTP ${res.statusCode()}")
        }
        return res.body()
    }

    fun testConnection(baseUrl: String, token: String): String {
        val body = request(baseUrl, token, "/api/user/profile")
        val profile = gson.fromJson(body, ProfileResponse::class.java)
        return profile.username ?: profile.Username ?: profile.email ?: profile.Email ?: "user"
    }

    fun fetchMyTasks(baseUrl: String, token: String): List<PmTask> {
        val body = request(baseUrl, token, "/api/tasks/my-tasks")
        val parsed = gson.fromJson(body, MyTasksResponse::class.java)
        return parsed.tasks.orEmpty().filter(TaskRules::isPending)
    }

    fun fetchTaskStatuses(baseUrl: String, token: String, organizationId: Int): List<PmStatusValue> {
        val body = request(baseUrl, token, "/api/status-values/task/$organizationId")
        val parsed = gson.fromJson(body, StatusValuesResponse::class.java)
        return parsed.statuses.orEmpty().sortedBy { it.sortOrder ?: 9999 }
    }

    fun updateTaskStatus(baseUrl: String, token: String, taskId: Int, statusId: Int) {
        request(
            baseUrl,
            token,
            "/api/tasks/$taskId",
            method = "PUT",
            jsonBody = """{"status":$statusId}"""
        )
    }

    /** Proxy helper for the Kanban webview (returns parsed JSON body as string). */
    fun proxyJson(
        baseUrl: String,
        token: String,
        path: String,
        method: String = "GET",
        jsonBody: String? = null
    ): String {
        return request(baseUrl, token, path, method = method.uppercase(), jsonBody = jsonBody)
    }
}

enum class AiContentMode { NAME, NAME_DESCRIPTION, FULL }

object AiPromptBuilder {
    fun build(task: PmTask, baseUrl: String, mode: AiContentMode, customFull: String = ""): String {
        val plain = HtmlPlainText.strip(task.description)
        val appUrl = "${baseUrl.trimEnd('/')}/projects/${task.projectId}"
        val due = task.dueDate?.take(10) ?: "—"
        return when (mode) {
            AiContentMode.NAME -> "Help me work on this task: ${task.taskName}"
            AiContentMode.NAME_DESCRIPTION ->
                """
                Help me work on this task:

                Title: ${task.taskName}

                Description:
                ${plain.ifBlank { "—" }}
                """.trimIndent()
            AiContentMode.FULL -> {
                val template = customFull.ifBlank {
                    """
                    Help me work on this task:

                    Title: {TaskName}
                    Project: {ProjectName}
                    Status: {StatusName}
                    Priority: {PriorityName}
                    Due: {DueDate}

                    Description:
                    {DescriptionPlain}

                    App: {AppUrl}
                    """.trimIndent()
                }
                template
                    .replace("{TaskName}", task.taskName.ifBlank { "—" })
                    .replace("{ProjectName}", task.projectName ?: "—")
                    .replace("{StatusName}", task.statusName ?: "—")
                    .replace("{PriorityName}", task.priorityName ?: "—")
                    .replace("{DueDate}", due)
                    .replace("{DescriptionPlain}", plain.ifBlank { "—" })
                    .replace("{AppUrl}", appUrl)
            }
        }
    }
}
