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
                <label for="projectSelect">Project</label>
                <select id="projectSelect" aria-label="Project"></select>
                <button type="button" id="refreshBtn">Refresh</button>
                <button type="button" id="configureBtn" class="primary">Configure</button>
              </div>
              <div id="statusLine" aria-live="polite"></div>
              <div id="board" role="list"></div>
              <div id="emptyState"></div>
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
        val layout = if (settings.kanbanLayout.equals("vertical", ignoreCase = true)) "vertical" else "horizontal"
        val payload = gson.toJson(
            mapOf(
                "type" to "config",
                "baseUrl" to settings.baseUrl.trimEnd('/'),
                "token" to "",
                "proxyViaHost" to true,
                "selectedProjectId" to selected,
                "layout" to layout,
                "hiddenStatuses" to settings.kanbanHiddenStatuses,
                "maxVisibleCards" to settings.kanbanMaxVisibleCards
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
                PmSettingsService.getInstance().state.selectedProjectId = id
            }
            "openExternal" -> {
                val url = obj.get("url")?.asString ?: return
                try {
                    Desktop.getDesktop().browse(URI.create(url))
                } catch (ex: Exception) {
                    notify("Could not open browser: ${ex.message}", NotificationType.ERROR)
                }
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
