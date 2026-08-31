import nodemailer from 'nodemailer'
import { env, mailEnabled } from '../config/env.js'

// Outgoing mail. Built lazily so the app boots fine with no mail credentials —
// every caller treats a failed send as non-fatal, and the reset flow falls back
// to returning the link in the response when mail is not configured.

let transporter = null

function getTransporter() {
  if (!mailEnabled) return null
  if (transporter) return transporter

  transporter = nodemailer.createTransport({
    host: env.mail.host,
    port: env.mail.port,
    // 465 is implicit TLS; 587 upgrades with STARTTLS.
    secure: env.mail.port === 465,
    auth: { user: env.mail.user, pass: env.mail.pass },
  })
  return transporter
}

/**
 * Send one message. Returns true when it was handed to the SMTP server.
 *
 * Never throws: a mail outage must not turn a working password reset into a
 * 500. Callers decide what to do when this returns false.
 */
export async function sendMail({ to, subject, html, text }) {
  const tx = getTransporter()
  if (!tx) return false

  try {
    await tx.sendMail({
      from: `IntivraBot <${env.mail.from}>`,
      to,
      subject,
      text,
      html,
    })
    return true
  } catch (err) {
    console.error('Mail send failed:', err.message)
    return false
  }
}

/** Verify the SMTP credentials actually work. Used by the startup check. */
export async function verifyMailer() {
  const tx = getTransporter()
  if (!tx) return { ok: false, reason: 'not configured' }
  try {
    await tx.verify()
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: err.message }
  }
}

// Inlined styles: every mail client strips <style> blocks, and the brand
// orange has to survive that.
function layout(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f5f5f4;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
      <tr><td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e7e5e4;">
          <tr>
            <td style="background:#ea580c;padding:20px 28px;">
              <span style="color:#ffffff;font-size:18px;font-weight:800;letter-spacing:-0.3px;">IntivraBot</span>
            </td>
          </tr>
          <tr>
            <td style="padding:28px;">
              <h1 style="margin:0 0 12px;font-size:19px;color:#1c1917;">${title}</h1>
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:16px 28px;background:#fafaf9;border-top:1px solid #e7e5e4;">
              <p style="margin:0;font-size:12px;color:#a8a29e;">
                AI Recruitment Platform
              </p>
            </td>
          </tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`
}

/** Password reset link. Returns true when the mail actually went out. */
export function sendPasswordResetEmail({ to, name, resetUrl, expiresMinutes = 30 }) {
  const greeting = name ? `Hi ${name},` : 'Hi,'

  const html = layout(
    'Reset your password',
    `<p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#57534e;">
       ${greeting}
     </p>
     <p style="margin:0 0 20px;font-size:14px;line-height:1.6;color:#57534e;">
       We received a request to reset your IntivraBot password. Click the button below to choose a new one.
     </p>
     <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 20px;">
       <tr><td style="border-radius:8px;background:#ea580c;">
         <a href="${resetUrl}"
            style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">
           Reset my password
         </a>
       </td></tr>
     </table>
     <p style="margin:0 0 16px;font-size:13px;line-height:1.6;color:#78716c;">
       This link expires in ${expiresMinutes} minutes and can only be used once.
     </p>
     <p style="margin:0 0 8px;font-size:12px;color:#a8a29e;">
       If the button does not work, copy this link into your browser:
     </p>
     <p style="margin:0 0 20px;font-size:12px;word-break:break-all;color:#ea580c;">
       ${resetUrl}
     </p>
     <p style="margin:0;padding-top:16px;border-top:1px solid #e7e5e4;font-size:13px;line-height:1.6;color:#78716c;">
       Didn't ask for this? You can ignore this email - your password stays the same.
     </p>`
  )

  const text = `${greeting}

We received a request to reset your IntivraBot password.

Open this link to choose a new one:
${resetUrl}

This link expires in ${expiresMinutes} minutes and can only be used once.

Didn't ask for this? You can ignore this email - your password stays the same.`

  return sendMail({ to, subject: 'Reset your IntivraBot password', html, text })
}
