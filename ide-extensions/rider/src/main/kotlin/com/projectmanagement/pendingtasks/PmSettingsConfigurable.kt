package com.projectmanagement.pendingtasks

import com.intellij.openapi.options.Configurable
import javax.swing.JCheckBox
import javax.swing.JComboBox
import javax.swing.JComponent
import javax.swing.JLabel
import javax.swing.JPanel
import javax.swing.JPasswordField
import javax.swing.JSpinner
import javax.swing.JTextField
import javax.swing.SpinnerNumberModel
import java.awt.BorderLayout
import java.awt.GridBagConstraints
import java.awt.GridBagLayout
import java.awt.Insets

class PmSettingsConfigurable : Configurable {
    private var panel: JPanel? = null
    private lateinit var baseUrlField: JTextField
    private lateinit var tokenField: JPasswordField
    private lateinit var refreshSpinner: JSpinner
    private lateinit var autoSubmitCheck: JCheckBox
    private lateinit var layoutCombo: JComboBox<String>
    private lateinit var hiddenStatusesField: JTextField
    private lateinit var maxCardsSpinner: JSpinner

    override fun getDisplayName(): String = "Project Management"

    override fun createComponent(): JComponent {
        baseUrlField = JTextField()
        tokenField = JPasswordField()
        refreshSpinner = JSpinner(SpinnerNumberModel(300, 0, 86400, 30))
        autoSubmitCheck = JCheckBox("AI auto-submit by default (Send now)")
        layoutCombo = JComboBox(arrayOf("horizontal", "vertical"))
        hiddenStatusesField = JTextField()
        maxCardsSpinner = JSpinner(SpinnerNumberModel(2, 0, 500, 1))

        val form = JPanel(GridBagLayout())
        val c = GridBagConstraints().apply {
            gridx = 0
            gridy = 0
            anchor = GridBagConstraints.WEST
            insets = Insets(4, 4, 4, 4)
        }
        fun row(label: String, field: JComponent) {
            c.gridx = 0
            c.weightx = 0.0
            c.fill = GridBagConstraints.NONE
            form.add(JLabel(label), c)
            c.gridx = 1
            c.fill = GridBagConstraints.HORIZONTAL
            c.weightx = 1.0
            form.add(field, c)
            c.gridy += 1
        }

        row("Base URL", baseUrlField)
        row("API token (pt_…)", tokenField)
        row("Refresh interval (seconds)", refreshSpinner)
        row("Kanban layout", layoutCombo)
        row("Hidden statuses (; separated)", hiddenStatusesField)
        row("Max visible cards (0=all)", maxCardsSpinner)

        c.gridx = 0
        c.gridwidth = 2
        c.weightx = 1.0
        form.add(autoSubmitCheck, c)
        c.gridy += 1
        form.add(JLabel("HTTPS needs a valid certificate; HTTP on LAN is OK. Self-signed not supported."), c)

        panel = JPanel(BorderLayout()).apply { add(form, BorderLayout.NORTH) }
        reset()
        return panel!!
    }

    override fun isModified(): Boolean {
        val s = PmSettingsService.getInstance().state
        val token = String(tokenField.password)
        val tokenChanged = token.isNotEmpty() && token != PmSettingsService.getApiToken()
        return baseUrlField.text.trimEnd('/') != s.baseUrl.trimEnd('/') ||
            refreshSpinner.value != s.refreshIntervalSeconds ||
            autoSubmitCheck.isSelected != s.aiAutoSubmit ||
            (layoutCombo.selectedItem as String) != s.kanbanLayout ||
            hiddenStatusesField.text != s.kanbanHiddenStatuses ||
            maxCardsSpinner.value != s.kanbanMaxVisibleCards ||
            tokenChanged
    }

    override fun apply() {
        val service = PmSettingsService.getInstance()
        service.state.baseUrl = baseUrlField.text.trim().trimEnd('/')
        service.state.refreshIntervalSeconds = refreshSpinner.value as Int
        service.state.aiAutoSubmit = autoSubmitCheck.isSelected
        service.state.kanbanLayout = layoutCombo.selectedItem as String
        service.state.kanbanHiddenStatuses = hiddenStatusesField.text
        service.state.kanbanMaxVisibleCards = maxCardsSpinner.value as Int
        val token = String(tokenField.password)
        if (token.isNotEmpty()) {
            PmSettingsService.setApiToken(token)
        }
    }

    override fun reset() {
        val s = PmSettingsService.getInstance().state
        baseUrlField.text = s.baseUrl
        tokenField.text = PmSettingsService.getApiToken()
        refreshSpinner.value = s.refreshIntervalSeconds
        autoSubmitCheck.isSelected = s.aiAutoSubmit
        layoutCombo.selectedItem = if (s.kanbanLayout == "vertical") "vertical" else "horizontal"
        hiddenStatusesField.text = s.kanbanHiddenStatuses
        maxCardsSpinner.value = s.kanbanMaxVisibleCards
    }
}
