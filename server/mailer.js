const nodemailer = require('nodemailer');

const configured = Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

const transporter = configured
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    })
  : null;

async function sendOtpEmail(to, name, code) {
  if (!configured && globalThis.Netlify) {
    // Deployed: nobody can see a printed code, so fail loudly
    throw new Error('SMTP_USER / SMTP_PASS are not set in Netlify environment variables');
  }
  if (!configured) {
    console.log('\n==============================================');
    console.log(`  [DEV MODE] OTP for ${to}: ${code}`);
    console.log('  (Set SMTP_USER / SMTP_PASS in .env to send real emails)');
    console.log('==============================================\n');
    return { dev: true };
  }
  await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to,
    subject: `${code} is your ATHLORA verification code`,
    text: `Hi ${name},\n\nYour ATHLORA verification code is ${code}.\nIt expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.\n\n- Team ATHLORA`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:460px;margin:auto;padding:24px;background:#0b0f14;color:#e8edf2;border-radius:16px">
        <h1 style="margin:0 0 4px;letter-spacing:4px;color:#c6ff3d">ATHLORA</h1>
        <p style="margin:0 0 24px;color:#8a97a6">The Anti-Sedentary Engine</p>
        <p>Hi ${escapeHtml(name)},</p>
        <p>Your verification code is:</p>
        <p style="font-size:34px;font-weight:bold;letter-spacing:10px;color:#c6ff3d;margin:16px 0">${code}</p>
        <p style="color:#8a97a6">It expires in 10 minutes. If you didn't request this, ignore this email.</p>
      </div>`,
  });
  return { dev: false };
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

module.exports = { sendOtpEmail, mailConfigured: configured };
