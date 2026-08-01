package com.projectmanagement.pendingtasks

import com.intellij.openapi.options.Configurable
import javax.swing.JCheckBox
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

    override fun getDisplayName(): String = "Project Management"

    override fun createComponent(): JComponent {
        baseUrlField = JTextField()
        tokenField = JPasswordField()
        refreshSpinner = JSpinner(SpinnerNumberModel(300, 0, 86400, 30))
        autoSubmitCheck = JCheckBox("AI auto-submit by default (Send now)")

        val form = JPanel(GridBagLayout())
        val c = GridBagConstraints().apply {
            gridx = 0
            gridy = 0
            anchor = GridBagConstraints.WEST
            insets = Insets(4, 4, 4, 4)
        }
        form.add(JLabel("Base URL"), c)
        c.gridx = 1
        c.fill = GridBagConstraints.HORIZONTAL
        c.weightx = 1.0
        form.add(baseUrlField, c)

        c.gridx = 0
        c.gridy = 1
        c.weightx = 0.0
        c.fill = GridBagConstraints.NONE
        form.add(JLabel("API token (pt_…)"), c)
        c.gridx = 1
        c.fill = GridBagConstraints.HORIZONTAL
        c.weightx = 1.0
        form.add(tokenField, c)

        c.gridx = 0
        c.gridy = 2
        c.weightx = 0.0
        c.fill = GridBagConstraints.NONE
        form.add(JLabel("Refresh interval (seconds)"), c)
        c.gridx = 1
        form.add(refreshSpinner, c)

        c.gridx = 0
        c.gridy = 3
        c.gridwidth = 2
        form.add(autoSubmitCheck, c)

        c.gridy = 4
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
            tokenChanged
    }

    override fun apply() {
        val service = PmSettingsService.getInstance()
        service.state.baseUrl = baseUrlField.text.trim().trimEnd('/')
        service.state.refreshIntervalSeconds = refreshSpinner.value as Int
        service.state.aiAutoSubmit = autoSubmitCheck.isSelected
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
    }
}
