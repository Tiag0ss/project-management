import nodemailer from 'nodemailer';
import { pool } from '../config/database';
import { RowDataPacket } from 'mysql2';
import { logActivity } from '../routes/activityLogs';
import { shouldSendEmail } from '../routes/emailPreferences';
import { decrypt } from './encryption';

interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  userId?: number;
  username?: string;
}

interface SMTPConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  fromEmail: string;
  fromName: string;
}

// Get SMTP configuration from database
async function getSMTPConfig(): Promise<SMTPConfig | null> {
  try {
    const [settings] = await pool.execute<RowDataPacket[]>(
      `SELECT SettingKey, SettingValue FROM SystemSettings 
       WHERE SettingKey IN ('smtpHost', 'smtpPort', 'smtpSecure', 'smtpUser', 'smtpPassword', 'smtpFrom', 'smtpFromName')`
    );

    if (settings.length === 0) {
      return null;
    }

    const config: any = {};
    settings.forEach((setting: any) => {
      config[setting.SettingKey] = setting.SettingValue;
    });

    // Validate required fields
    if (!config.smtpHost || !config.smtpPort || !config.smtpUser || !config.smtpPassword || !config.smtpFrom) {
      return null;
    }

    return {
      host: config.smtpHost,
      port: parseInt(config.smtpPort),
      secure: config.smtpSecure === 'true' || config.smtpSecure === '1',
      user: config.smtpUser,
      pass: decrypt(config.smtpPassword),
      fromEmail: config.smtpFrom,
      fromName: config.smtpFromName || 'Project Management System',
    };
  } catch (error) {
    console.error('Error getting SMTP config:', error);
    return null;
  }
}

// Send email
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const smtpConfig = await getSMTPConfig();

    if (!smtpConfig) {
      console.error('SMTP configuration not found or incomplete');
      await logActivity(
        options.userId ?? null,
        options.username || null,
        'EMAIL_ERROR',
        'Email',
        null,
        null,
        `Failed to send email to ${options.to}: SMTP configuration not found or incomplete`,
        null,
        null
      );
      return false;
    }

    // Determine secure mode based on port:
    // Port 465 = direct TLS (secure: true)
    // Port 587 = STARTTLS (secure: false, TLS upgraded after connection)
    // Other ports = use configured value
    const useSecure = smtpConfig.port === 465 ? true : smtpConfig.port === 587 ? false : smtpConfig.secure;

    // Create transporter
    const transporter = nodemailer.createTransport({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: useSecure,
      auth: {
        user: smtpConfig.user,
        pass: smtpConfig.pass,
      },
      // For port 587, require STARTTLS upgrade
      ...(smtpConfig.port === 587 && { requireTLS: true }),
    });

    // Send email
    await transporter.sendMail({
      from: `"${smtpConfig.fromName}" <${smtpConfig.fromEmail}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
    });

    return true;
  } catch (error: any) {
    console.error('Error sending email:', error);
    
    // Log error to activity logs
    await logActivity(
      options.userId ?? null,
      options.username || null,
      'EMAIL_ERROR',
      'Email',
      null,
      null,
      `Failed to send email to ${options.to}: ${error.message}`,
      null,
      null
    );

    return false;
  }
}

// Send notification email
export async function sendNotificationEmail(
  userId: number,
  userEmail: string,
  notificationType: string,
  title: string,
  message: string,
  link?: string
): Promise<boolean> {
  try {
    // Check if user wants to receive emails for this notification type
    const wantsEmail = await shouldSendEmail(userId, notificationType);
    
    if (!wantsEmail) {
      return false;
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const fullLink = link ? `${baseUrl}${link}` : baseUrl;

    const html = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
              background-color: #f5f5f5;
            }
            .container {
              background-color: #ffffff;
              border-radius: 8px;
              padding: 30px;
              box-shadow: 0 2px 4px rgba(0,0,0,0.1);
            }
            .header {
              border-bottom: 3px solid #3b82f6;
              padding-bottom: 20px;
              margin-bottom: 20px;
            }
            .header h1 {
              margin: 0;
              color: #1f2937;
              font-size: 24px;
            }
            .content {
              margin-bottom: 30px;
            }
            .message {
              background-color: #f3f4f6;
              border-left: 4px solid #3b82f6;
              padding: 15px;
              margin: 20px 0;
              border-radius: 4px;
            }
            .button {
              display: inline-block;
              background-color: #3b82f6;
              color: #ffffff;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              font-weight: 500;
              margin: 20px 0;
            }
            .button:hover {
              background-color: #2563eb;
            }
            .footer {
              margin-top: 30px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              font-size: 12px;
              color: #6b7280;
              text-align: center;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>${title}</h1>
            </div>
            <div class="content">
              <div class="message">
                ${message}
              </div>
              ${link ? `
                <a href="${fullLink}" class="button">View Details</a>
              ` : ''}
            </div>
            <div class="footer">
              <p>You received this email because you have enabled email notifications for this type of event.</p>
              <p>To manage your email preferences, visit your profile settings.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return await sendEmail({
      to: userEmail,
      subject: title,
      html,
      userId,
    });
  } catch (error) {
    console.error('Error sending notification email:', error);
    return false;
  }
}
