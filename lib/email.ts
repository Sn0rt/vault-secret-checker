import nodemailer from 'nodemailer';
import { serverDebug, serverError } from './server-logger';

interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

interface UnwrapNotificationData {
  timestamp: string;
  endpoint: string;
  success: boolean;
  userAgent?: string;
  ipAddress?: string;
  response?: unknown;
}

interface EmailSendResult {
  success: number;
  failed: number;
  details: string[];
}

declare global {
  var __smtpVerificationPromise: Promise<void> | undefined;
}

// Helper function to safely get error code
function getErrorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String(error.code) || 'Unknown error';
  }
  return 'Unknown error';
}

// Helper function to safely get error message
function getErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    return String(error.message);
  }
  return 'Unknown error';
}

// Check if SMTP is configured
export function isSmtpConfigured(): boolean {
  return !!process.env.SMTP_HOST &&
    process.env.SMTP_HOST !== 'smtp.example.com' &&
    process.env.SMTP_HOST !== 'xxx.example.com'; // Add invalid example hostname
}

// Parse multiple email addresses (support comma and space separators)
export function parseEmailAddresses(emailString: string): string[] {
  if (!emailString) return [];

  return emailString
    .split(/[,\s]+/)
    .map(email => email.trim())
    .filter(email => email && isValidEmail(email));
}

// Create transporter based on environment variables
function createTransporter() {
  const config = {
    host: process.env.SMTP_HOST || 'localhost',
    port: parseInt(process.env.SMTP_PORT || '25'),
    secure: process.env.SMTP_SECURE === 'true', // true for SSL/TLS
    auth: undefined as { user: string; pass: string } | undefined,
    // For debugging servers, disable some checks
    ignoreTLS: true,
    requireTLS: false,
    // Add debugging and timeout options
    debug: process.env.DEBUG === 'true',
    logger: process.env.DEBUG === 'true',
    connectionTimeout: 10000, // 10 seconds
    greetingTimeout: 5000,    // 5 seconds
    socketTimeout: 10000      // 10 seconds
  };

  // Add authentication if credentials are provided
  if (process.env.SMTP_USER && process.env.SMTP_PASSWORD) {
    config.auth = {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD
    };
  }

  return nodemailer.createTransport(config);
}

async function verifySmtpConnection(): Promise<void> {
  const transporter = createTransporter();
  serverDebug('Verifying SMTP connection...');
  await transporter.verify();
}

// Validate email address format
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Send email notification
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  try {
    const recipients = Array.isArray(options.to) ? options.to : [options.to];
    const adminCcRecipients = parseEmailAddresses(process.env.SMTP_ADMIN_CC_WITH || '');

    if (recipients.length === 0 || recipients.some((email) => !isValidEmail(email))) {
      serverError('Invalid email address format.', { recipients });
      return false;
    }

    const transporter = createTransporter();
    await ensureSmtpReady();

    const fromEmail = process.env.SMTP_FROM_EMAIL || 'noreply@example.com';

    const mailOptions = {
      from: fromEmail,
      to: recipients,
      cc: adminCcRecipients.length > 0 ? adminCcRecipients : undefined,
      subject: options.subject,
      text: options.text,
      html: options.html
    };

    serverDebug('Sending email:', {
      recipientCount: recipients.length,
      adminCcCount: adminCcRecipients.length,
      subject: options.subject,
      from: fromEmail
    });

    const result = await transporter.sendMail(mailOptions);

    serverDebug('Email sent successfully:', {
      messageId: result.messageId,
      recipientCount: recipients.length,
      adminCcCount: adminCcRecipients.length
    });

    return true;
  } catch (error) {
    serverError('Failed to send email:', {
      recipientCount: Array.isArray(options.to) ? options.to.length : 1,
      subject: options.subject,
      error: getErrorCode(error)
    });
    return false;
  }
}

// Send unwrap notification email to multiple recipients
export async function sendUnwrapNotification(
  emailString: string,
  data: UnwrapNotificationData
): Promise<EmailSendResult> {
  const result: EmailSendResult = {
    success: 0,
    failed: 0,
    details: []
  };

  // Check if SMTP is configured
  if (!isSmtpConfigured()) {
    serverDebug('SMTP not configured, skipping email notification');
    result.details.push('SMTP not configured');
    return result;
  }

  // Parse email addresses
  const emails = parseEmailAddresses(emailString);

  if (emails.length === 0) {
    serverDebug('No valid email addresses found');
    result.details.push('No valid email addresses found');
    return result;
  }

  serverDebug(`Sending unwrap notification to ${emails.length} recipients:`, emails);

  const subject = `Token Unwrap Notification - ${data.success ? 'Success' : 'Failed'}`;

  // Get configurable app title
  const appTitle = process.env.NEXT_PUBLIC_APP_TITLE || 'Vault Secret Checker';

  // Format response data for display
  const responseData = data.response ? JSON.stringify(data.response, null, 2) : 'No response data available';

  const textContent = `Token Unwrap Notification

Status: ${data.success ? 'SUCCESS' : 'FAILED'}
Timestamp: ${data.timestamp}
Endpoint: ${data.endpoint}
User Agent: ${data.userAgent || 'Unknown'}
IP Address: ${data.ipAddress || 'Unknown'}

Response Data:
${responseData}

This notification was generated automatically by the ${appTitle} system.`;

  try {
    const success = await sendEmail({
      to: emails,
      subject,
      text: textContent
    });

    if (success) {
      result.success = emails.length;
      result.details.push(`Successfully sent one email to ${emails.length} recipients`);
    } else {
      result.failed = emails.length;
      result.details.push(`Failed to send email to ${emails.length} recipients`);
    }
  } catch (error) {
    result.failed = emails.length;
    result.details.push(`Error sending email to ${emails.length} recipients: ${error}`);
    serverError('Failed to send unwrap notification email.', error);
  }

  serverDebug('Email notification results:', result);
  return result;
}

// Test email configuration
export async function testEmailConfiguration(): Promise<boolean> {
  try {
    serverDebug('Testing email configuration...');
    await verifySmtpConnection();
    serverDebug('SMTP configuration is valid');
    return true;
  } catch (error) {
    serverError('SMTP configuration test failed:', {
      errorCode: getErrorCode(error),
      errorMessage: getErrorMessage(error)
    });
    return false;
  }
}

export async function ensureSmtpReady(): Promise<void> {
  if (!isSmtpConfigured()) {
    return;
  }

  if (!globalThis.__smtpVerificationPromise) {
    globalThis.__smtpVerificationPromise = (async () => {
      await verifySmtpConnection();
      serverDebug('SMTP connection verified successfully');
    })();
  }

  await globalThis.__smtpVerificationPromise;
}
