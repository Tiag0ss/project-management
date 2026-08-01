package com.projectmanagement.pendingtasks

import com.intellij.notification.NotificationGroupManager
import com.intellij.notification.NotificationType
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.application.ApplicationManager
import com.intellij.openapi.ide.CopyPasteManager
import com.intellij.openapi.project.DumbAware
import com.intellij.openapi.project.Project
import com.intellij.openapi.wm.ToolWindow
import com.intellij.openapi.wm.ToolWindowFactory
import com.intellij.ui.components.JBLabel
import com.intellij.ui.components.JBList
import com.intellij.ui.components.JBScrollPane
import com.intellij.ui.content.ContentFactory
import com.intellij.util.ui.JBUI
import java.awt.BorderLayout
import java.awt.Desktop
import java.awt.FlowLayout
import java.awt.datatransfer.StringSelection
import java.net.URI
import javax.swing.DefaultListModel
import javax.swing.JButton
import javax.swing.JOptionPane
import javax.swing.JPanel
import javax.swing.ListSelectionModel
import javax.swing.SwingUtilities

class PendingTasksToolWindowFactory : ToolWindowFactory, DumbAware {
    override fun createToolWindowContent(project: Project, toolWindow: ToolWindow) {
        val panel = PendingTasksPanel()
        val content = ContentFactory.getInstance().createContent(panel, "", false)
        toolWindow.contentManager.addContent(content)
        panel.reloadAsync()
    }
}

class PendingTasksPanel : JPanel(BorderLayout()) {
    private val model = DefaultListModel<PmTask>()
    private val list = JBList(model)
    private val statusLabel = JBLabel(" ")

    init {
        border = JBUI.Borders.empty(8)
        list.selectionMode = ListSelectionModel.SINGLE_SELECTION
        list.cellRenderer = TaskListCellRenderer()

        val toolbar = JPanel(FlowLayout(FlowLayout.LEFT)).apply {
            add(JButton("Refresh").also { it.addActionListener { reloadAsync() } })
            add(JButton("Open in browser").also { it.addActionListener { openSelected() } })
            add(JButton("Copy AI prompt…").also { it.addActionListener { copyAiPrompt() } })
        }

        add(toolbar, BorderLayout.NORTH)
        add(JBScrollPane(list), BorderLayout.CENTER)
        add(statusLabel, BorderLayout.SOUTH)
    }

    fun reloadAsync() {
        statusLabel.text = "Loading…"
        val settings = PmSettingsService.getInstance().state
        val token = PmSettingsService.getApiToken()
        ApplicationManager.getApplication().executeOnPooledThread {
            try {
                if (settings.baseUrl.isBlank() || token.isBlank()) {
                    throw IllegalStateException("Configure Base URL and API token under Settings → Tools → Project Management")
                }
                val tasks = PmApi.fetchMyTasks(settings.baseUrl, token)
                val grouped = TaskRules.groupByProject(tasks)
                val flat = grouped.values.flatten()
                SwingUtilities.invokeLater {
                    model.clear()
                    flat.forEach { model.addElement(it) }
                    statusLabel.text = "${flat.size} pending task(s)"
                }
            } catch (ex: Exception) {
                SwingUtilities.invokeLater {
                    model.clear()
                    statusLabel.text = ex.message ?: "Error"
                    notify("Failed to load tasks: ${ex.message}", NotificationType.ERROR)
                }
            }
        }
    }

    private fun selected(): PmTask? = list.selectedValue

    private fun openSelected() {
        val task = selected() ?: return
        val base = PmSettingsService.getInstance().state.baseUrl.trimEnd('/')
        if (base.isBlank()) return
        Desktop.getDesktop().browse(URI.create("$base/projects/${task.projectId}"))
    }

    private fun copyAiPrompt() {
        val task = selected()
        if (task == null) {
            notify("Select a task first", NotificationType.WARNING)
            return
        }
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

class TaskListCellRenderer : JBLabel(), javax.swing.ListCellRenderer<PmTask> {
    override fun getListCellRendererComponent(
        list: javax.swing.JList<out PmTask>?,
        value: PmTask?,
        index: Int,
        isSelected: Boolean,
        cellHasFocus: Boolean
    ): java.awt.Component {
        text = if (value == null) {
            ""
        } else {
            val due = value.dueDate?.take(10).orEmpty()
            val meta = listOfNotNull(value.projectName, value.statusName, value.priorityName, due.ifBlank { null })
                .joinToString(" · ")
            "${value.taskName}  —  $meta"
        }
        border = JBUI.Borders.empty(4, 6)
        if (list != null) {
            background = if (isSelected) list.selectionBackground else list.background
            foreground = if (isSelected) list.selectionForeground else list.foreground
        }
        isOpaque = true
        return this
    }
}

class RefreshTasksAction : AnAction(), DumbAware {
    override fun actionPerformed(e: AnActionEvent) {
        // Tool window refresh is button-driven; this action is a stub for keymap binding.
        notifyInfo("Open the PM Pending Tasks tool window and click Refresh.")
    }

    private fun notifyInfo(message: String) {
        NotificationGroupManager.getInstance()
            .getNotificationGroup("Project Management")
            .createNotification(message, NotificationType.INFORMATION)
            .notify(null)
    }
}
