package com.projectmanagement.pendingtasks

import com.google.gson.Gson
import com.google.gson.JsonParser
import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.util.Disposer
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.content.ContentFactory
import com.intellij.ui.jcef.JBCefBrowser
import com.intellij.ui.jcef.JBCefBrowserBase
import com.intellij.ui.jcef.JBCefJSQuery
import java.awt.BorderLayout
import java.awt.Desktop
import java.awt.datatransfer.StringSelection
import java.net.URI
import javax.swing.JOptionPane
import javax.swing.JPanel
import javax.swing.SwingUtilities

class KanbanToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = KanbanPanel()
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
        Disposer.register(content, panel)
        panel.bootstrap()
    }
}

class KanbanPanel : JPanel(BorderLayout()), com.intellij.openapi.Disposable {
    private val gson = Gson()
    private val browser: JBCefBrowser = JBCefBrowser.createBuilder().setOffScreenRendering(false).build()
    private val jsQuery: JBCefJSQuery = JBCefJSQuery.create(browser as JBCefBrowserBase)

    init {
        add(browser.component, BorderLayout.CENTER)
        jsQuery.addHandler { request ->
            SwingUtilities.invokeLater { handleBoardMessage(request) }
            null
        }
    }

    fun bootstrap() {
        browser.loadHTML(buildHtml())
        // Give CEF a moment to parse scripts, then push config
        ApplicationManager.getApplication().executeOnPooledThread {
            Thread.sleep(250)
            SwingUtilities.invokeLater { pushConfig() }
        }
    }

    override fun dispose() {
        Disposer.dispose(browser)
    }

    private fun buildHtml(): String {
        val css = readResource("/kanban/board.css")
        val js = readResource("/kanban/board.js")
        val inject = jsQuery.inject("msg")
        val bootstrap = """
            window.pmHost = {
              postMessage: function(payload) {
                var msg = (typeof payload === 'string') ? payload : JSON.stringify(payload);
                $inject;
              }
            };
        """.trimIndent()
        return """
            <!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Project Management — Kanban</title>
              <style>$css</style>
            </head>
            <body>
              <div id="toolbar">
                    <label for="projectSearch">Project</label>
                    <div id="projectPicker" class="project-picker">
                      <input
                        id="projectSearch"
                        type="text"
                        autocomplete="off"
                        placeholder="Search projects…"
                        aria-label="Search projects"
                        aria-autocomplete="list"
                        aria-controls="projectList"
                        aria-expanded="false"
                      />
                      <button type="button" id="projectPickerToggle" aria-label="Toggle project list" tabindex="-1">
                        ▾
                      </button>
                      <ul id="projectList" role="listbox" hidden></ul>
                    </div>
                    <label for="sprintFilter">Sprint</label>
                    <select id="sprintFilter" disabled aria-label="Filter by sprint">
                      <option value="all">All sprints</option>
                      <option value="backlog">Backlog (no sprint)</option>
                    </select>
                    <button type="button" id="addTaskBtn" disabled>Add task</button>
                    <button type="button" id="refreshBtn">Refresh</button>
                    <button type="button" id="configureBtn" class="primary">Configure</button>
                  </div>
                  <div id="activeTimerBar" class="active-timer-bar" hidden>
                    <span id="activeTimerLabel"></span>
                    <button type="button" id="activeTimerStop">Stop</button>
                  </div>
                  <div id="statusLine" aria-live="polite"></div>
                  <div id="board" role="list"></div>
                  <div id="emptyState"></div>
                  <div id="createTaskModal" class="modal" hidden aria-hidden="true">
                    <div class="modal-backdrop" data-close-modal></div>
                    <div class="modal-dialog" role="dialog" aria-labelledby="createTaskTitle" aria-modal="true">
                      <h2 id="createTaskTitle">New task</h2>
                      <label for="createTaskName">Name</label>
                      <input id="createTaskName" type="text" maxlength="255" autocomplete="off" />
                      <label for="createTaskStatus">Status</label>
                      <select id="createTaskStatus"></select>
                      <label for="createTaskPriority">Priority</label>
                      <select id="createTaskPriority"></select>
                      <p id="createTaskError" class="modal-error" hidden></p>
                      <div class="modal-actions">
                        <button type="button" id="createTaskCancel" data-close-modal>Cancel</button>
                        <button type="button" id="createTaskSubmit" class="primary">Create</button>
                      </div>
                    </div>
                  </div>
              <script>$bootstrap</script>
              <script>$js</script>
            </body>
            </html>
        """.trimIndent()
    }

    private fun readResource(path: String): String {
        val stream = javaClass.getResourceAsStream(path)
            ?: throw IllegalStateException("Missing resource $path")
        return stream.bufferedReader(Charsets.UTF_8).use { it.readText() }
    }

    private fun pushConfig() {
        val settings = PmSettingsService.getInstance().state
        val selected = settings.selectedProjectId.takeIf { it > 0 }
        val sprintFilter = settings.selectedSprintFilter.ifBlank { "all" }
        val layout = if (settings.kanbanLayout.equals("vertical", ignoreCase = true)) "vertical" else "horizontal"
        val payload = gson.toJson(
            mapOf(
                "type" to "config",
                "baseUrl" to settings.baseUrl.trimEnd('/'),
                "token" to "",
                "proxyViaHost" to true,
                "selectedProjectId" to selected,
                "selectedSprintFilter" to sprintFilter,
                "layout" to layout,
                "hiddenStatuses" to settings.kanbanHiddenStatuses,
                "maxVisibleCards" to settings.kanbanMaxVisibleCards,
                "aiInProgressStatusId" to settings.aiInProgressStatusId
            )
        )
        postToBoard(payload)
    }

    private fun postToBoard(json: String) {
        val escaped = json
            .replace("\\", "\\\\")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "")
        browser.cefBrowser.executeJavaScript(
            "window.dispatchEvent(new MessageEvent('message',{data:JSON.parse('$escaped')}));",
            browser.cefBrowser.url,
            0
        )
    }

    private fun handleBoardMessage(raw: String?) {
        if (raw.isNullOrBlank()) return
        val obj = try {
            JsonParser.parseString(raw).asJsonObject
        } catch (_: Exception) {
            return
        }
        when (obj.get("type")?.asString) {
            "ready" -> pushConfig()
            "configure" -> {
                notify(
                    "Open Settings → Tools → Project Management to set Base URL and API token, then click Refresh on the board.",
                    NotificationType.INFORMATION
                )
            }
            "projectSelected" -> {
                val id = obj.get("projectId")?.takeIf { !it.isJsonNull }?.asInt ?: 0
                val settings = PmSettingsService.getInstance().state
                settings.selectedProjectId = id
                settings.selectedSprintFilter = "all"
            }
            "sprintSelected" -> {
                val raw = obj.get("sprintFilter") ?: return
                val settings = PmSettingsService.getInstance().state
                settings.selectedSprintFilter = when {
                    raw.isJsonNull -> "all"
                    raw.isJsonPrimitive && raw.asJsonPrimitive.isNumber -> raw.asInt.toString()
                    else -> raw.asString.ifBlank { "all" }
                }
            }
            "openExternal" -> {
                val url = obj.get("url")?.asString ?: return
                try {
                    Desktop.getDesktop().browse(URI.create(url))
                } catch (ex: Exception) {
                    notify("Could not open browser: ${ex.message}", NotificationType.ERROR)
                }
            }
            "openTask" -> {
                val taskEl = obj.get("task") ?: return
                val task = gson.fromJson(taskEl, PmTask::class.java) ?: return
                val base = PmSettingsService.getInstance().state.baseUrl.trimEnd('/')
                if (base.isBlank()) {
                    notify("Configure Base URL first", NotificationType.WARNING)
                    return
                }
                val url = "$base/projects/${task.projectId}?tab=tasks&taskId=${task.id}"
                try {
                    Desktop.getDesktop().browse(URI.create(url))
                } catch (ex: Exception) {
                    notify("Could not open browser: ${ex.message}", NotificationType.ERROR)
                }
            }
            "copyText" -> {
                val text = obj.get("text")?.asString ?: return
                val label = obj.get("label")?.asString ?: "Text"
                CopyPasteManager.getInstance().setContents(StringSelection(text))
                notify("$label copied to clipboard.", NotificationType.INFORMATION)
            }
            "sendToAi" -> {
                val taskEl = obj.get("task") ?: return
                val task = gson.fromJson(taskEl, PmTask::class.java) ?: return
                copyAiPrompt(task)
            }
            "error" -> {
                val message = obj.get("message")?.asString ?: return
                notify(message, NotificationType.ERROR)
            }
            "apiRequest" -> {
                val requestId = obj.get("requestId")?.asString ?: return
                val path = obj.get("path")?.asString ?: return
                val method = obj.get("method")?.asString ?: "GET"
                val bodyEl = obj.get("body")
                val jsonBody = if (bodyEl == null || bodyEl.isJsonNull) null else gson.toJson(bodyEl)
                ApplicationManager.getApplication().executeOnPooledThread {
                    val settings = PmSettingsService.getInstance().state
                    val token = PmSettingsService.getApiToken()
                    try {
                        val dataJson = PmApi.proxyJson(settings.baseUrl, token, path, method, jsonBody)
                        val data = JsonParser.parseString(dataJson)
                        val response = com.google.gson.JsonObject().apply {
                            addProperty("type", "apiResponse")
                            addProperty("requestId", requestId)
                            addProperty("ok", true)
                            add("data", data)
                        }
                        SwingUtilities.invokeLater { postToBoard(gson.toJson(response)) }
                    } catch (ex: Exception) {
                        val response = com.google.gson.JsonObject().apply {
                            addProperty("type", "apiResponse")
                            addProperty("requestId", requestId)
                            addProperty("ok", false)
                            addProperty("error", ex.message ?: "Request failed")
                        }
                        SwingUtilities.invokeLater { postToBoard(gson.toJson(response)) }
                    }
                }
            }
        }
    }

    private fun copyAiPrompt(task: PmTask) {
        val modes = arrayOf("Name only", "Name + description", "Full context")
        val choice = JOptionPane.showOptionDialog(
            this,
            "AI prompt content",
            "Copy AI prompt",
            JOptionPane.DEFAULT_OPTION,
            JOptionPane.QUESTION_MESSAGE,
            null,
            modes,
            modes[2]
        )
        if (choice < 0) return
        val mode = when (choice) {
            0 -> AiContentMode.NAME
            1 -> AiContentMode.NAME_DESCRIPTION
            else -> AiContentMode.FULL
        }
        val settings = PmSettingsService.getInstance().state
        val prompt = AiPromptBuilder.build(task, settings.baseUrl, mode, settings.aiPromptTemplate)
        CopyPasteManager.getInstance().setContents(StringSelection(prompt))
        notify(
            "AI prompt copied to clipboard — paste into AI Assistant and edit before sending.",
            NotificationType.INFORMATION
        )
    }

    private fun notify(message: String, type: NotificationType) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("Project Management")
            .createNotification(message, type)
            .notify(null)
    }
}
