const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'mail.bulletin.uz',
    port: parseInt(process.env.SMTP_PORT) || 465,
    secure: true, // SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    },
    tls: { rejectUnauthorized: false } // cPanel self-signed certs
});

const FROM = `"IT Park Bulletin" <${process.env.SMTP_USER || 'info@bulletin.uz'}>`;

async function sendMail(to, subject, html) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('Email not configured — skipping:', subject);
        return;
    }
    try {
        await transporter.sendMail({ from: FROM, to, subject, html });
    } catch (e) {
        console.error('Email send error:', e.message);
    }
}

// Send to multiple recipients
async function sendMailToMany(recipients, subject, html) {
    if (!recipients || recipients.length === 0) return;
    // Send as BCC to avoid exposing emails
    return sendMail(process.env.SMTP_USER, subject, html).catch(() => {}).then(() => {
        return transporter.sendMail({
            from: FROM,
            to: process.env.SMTP_USER,
            bcc: recipients.join(', '),
            subject,
            html
        }).catch(e => console.error('Bulk email error:', e.message));
    });
}

// Email templates
function welcomeEmail(name) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">IT Park Bulletin</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>Welcome, ${name}!</h2>
            <p>Your account has been created. Please wait for admin approval before you can access the system.</p>
            <p style="color:#6b7280;font-size:0.9rem;">You will receive another email once your account is approved.</p>
        </div>
    </div>`;
}

function newUserAdminEmail(name, email, department) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">New User Registration</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p>A new user has registered and needs approval:</p>
            <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;">Name:</td><td style="padding:8px;">${name}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Email:</td><td style="padding:8px;">${email}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Department:</td><td style="padding:8px;">${department || 'Not set'}</td></tr>
            </table>
            <p style="margin-top:16px;">Please log in to the admin panel to approve or reject this user.</p>
        </div>
    </div>`;
}

function internApplyHREmail(name, email, phone) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#f59e0b;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">New Intern Application</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p>A new intern has applied:</p>
            <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px;font-weight:bold;">Name:</td><td style="padding:8px;">${name}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Email:</td><td style="padding:8px;">${email}</td></tr>
                <tr><td style="padding:8px;font-weight:bold;">Phone:</td><td style="padding:8px;">${phone || 'N/A'}</td></tr>
            </table>
            <p style="margin-top:16px;">Please review this application in the HR dashboard.</p>
        </div>
    </div>`;
}

function approvalEmail(name, approved) {
    const status = approved ? 'Approved' : 'Rejected';
    const color = approved ? '#22c55e' : '#ef4444';
    const message = approved
        ? 'Your account has been approved! You can now log in and access the IT Park Bulletin system.'
        : 'Unfortunately, your account application has been rejected. Please contact HR for more information.';
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:${color};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">Account ${status}</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>Hello, ${name}!</h2>
            <p>${message}</p>
        </div>
    </div>`;
}

function internApprovedEmail(name) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#22c55e;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">Internship Approved!</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>Congratulations, ${name}!</h2>
            <p>Your internship application has been approved. Please log in to upload your required documents:</p>
            <ul>
                <li>Photo 3x4</li>
                <li>Passport (PDF)</li>
                <li>INN (PDF)</li>
                <li>Diploma (PDF)</li>
                <li>Resume (PDF)</li>
                <li>IELTS Certificate (optional)</li>
            </ul>
            <p style="color:#6b7280;font-size:0.9rem;">Upload all required documents as soon as possible.</p>
        </div>
    </div>`;
}

function docsUploadedHREmail(internName) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">Documents Uploaded</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p><strong>${internName}</strong> has uploaded all required documents.</p>
            <p>Please review the documents in the HR dashboard and proceed with the assignment.</p>
        </div>
    </div>`;
}

function assignmentEmail(internName, mentorName, department, notes) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#8b5cf6;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">New Intern Assignment</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p>You have been assigned to mentor intern <strong>${internName}</strong> in the <strong>${department}</strong> department.</p>
            ${notes ? `<p><strong>Notes:</strong> ${notes}</p>` : ''}
            <p>Please check your tasks in the Bulletin system for full details and documents.</p>
        </div>
    </div>`;
}

function statusChangeEmail(name, newStatus, department) {
    const titles = { on_hold: 'Trial Period Started', employee: 'Welcome Aboard!' };
    const messages = {
        on_hold: `Your trial period has started${department ? ' in the ' + department + ' department' : ''}. The trial lasts 3 months. Good luck!`,
        employee: 'Congratulations! You are now an official employee of IT Park. Welcome to the team!'
    };
    const colors = { on_hold: '#f59e0b', employee: '#22c55e' };
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:${colors[newStatus] || '#2563eb'};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">${titles[newStatus] || 'Status Update'}</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>Hello, ${name}!</h2>
            <p>${messages[newStatus] || 'Your employment status has been updated.'}</p>
        </div>
    </div>`;
}

function announcementEmail(title, content, authorName) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">New Announcement</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>${title}</h2>
            <p>${content}</p>
            <p style="color:#6b7280;font-size:0.85rem;margin-top:16px;">Posted by ${authorName}</p>
        </div>
    </div>`;
}

function trialWarningEmail(userName, daysLeft) {
    const urgent = daysLeft <= 5;
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:${urgent ? '#ef4444' : '#f59e0b'};color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">Trial Period ${urgent ? 'Ending Soon!' : 'Reminder'}</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <p><strong>${userName}</strong>'s trial period ends in <strong>${daysLeft} days</strong>.</p>
            <p>Please review their performance and make a decision on their employment status.</p>
        </div>
    </div>`;
}

function verifyEmailTemplate(name, verifyUrl) {
    return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <div style="background:#2563eb;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center;">
            <h1 style="margin:0;">IT Park Bulletin</h1>
        </div>
        <div style="padding:20px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:0 0 8px 8px;">
            <h2>Verify your email, ${name}</h2>
            <p>Thank you for registering. Please click the button below to verify your email address:</p>
            <div style="text-align:center;margin:24px 0;">
                <a href="${verifyUrl}" style="background:#2563eb;color:white;padding:12px 32px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block;">Verify Email</a>
            </div>
            <p style="color:#6b7280;font-size:0.85rem;">If you did not register, you can ignore this email. The link expires in 24 hours.</p>
        </div>
    </div>`;
}

module.exports = {
    sendMail,
    sendMailToMany,
    verifyEmailTemplate,
    welcomeEmail,
    newUserAdminEmail,
    internApplyHREmail,
    approvalEmail,
    internApprovedEmail,
    docsUploadedHREmail,
    assignmentEmail,
    statusChangeEmail,
    announcementEmail,
    trialWarningEmail
};
