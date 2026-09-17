import nodemailer from 'nodemailer';

function adminAppUrl() {
  return String(process.env.ADMIN_APP_URL || 'http://localhost:5174').replace(/\/$/, '');
}

function mailEnabled() {
  return Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);
}

function fromAddress() {
  return process.env.MAIL_FROM || process.env.SMTP_USER;
}

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

function wrapHtml({ heading, body, buttonLabel, buttonUrl }) {
  const button = buttonUrl
    ? `<p style="margin:28px 0 8px">
        <a href="${buttonUrl}" style="display:inline-block;background:#c1121f;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 22px;border-radius:999px">
          ${buttonLabel || 'Open admin'}
        </a>
      </p>`
    : '';
  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f6f1ea;font-family:Arial,sans-serif;color:#1f1a17">
    <div style="max-width:560px;margin:24px auto;background:#fff;border-radius:24px;padding:32px 28px">
      <p style="margin:0 0 6px;font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c1121f;font-weight:700">MyLand Admin</p>
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3">${heading}</h1>
      ${body}
      ${button}
    </div>
  </body>
</html>`;
}

async function sendMail({ to, subject, text, html }) {
  if (!to) return false;

  if (mailEnabled()) {
    await transporter().sendMail({
      from: fromAddress(),
      to,
      subject,
      text,
      html,
    });
    console.log(`mail sent (smtp): ${subject} -> ${to}`);
    return true;
  }

  console.warn(`mail skipped (set SMTP_USER and SMTP_PASS): ${subject} -> ${to}`);
  return false;
}

function actionLabel(action) {
  if (action === 'create') return 'a new listing';
  if (action === 'delete') return 'a listing deletion';
  return 'listing changes';
}

function listingTitle(project) {
  return project?.pendingPayload?.title || project?.title || 'Untitled listing';
}

async function safeSend(task) {
  try {
    await task();
  } catch (err) {
    console.error('listing mail failed:', err.message);
  }
}

export async function notifyListingSubmitted(project, { actor } = {}) {
  const to = project?.approverEmail;
  if (!to) return;
  const title = listingTitle(project);
  const requester = actor?.name || project?.requestedByName || 'A staff user';
  const listingsUrl = `${adminAppUrl()}/listings`;
  const action = actionLabel(project?.pendingAction);
  const text = `${requester} sent ${action} for "${title}" to you for approval.\n\nOpen Manage Listings to approve or decline:\n${listingsUrl}`;
  await safeSend(() =>
    sendMail({
      to,
      subject: `Listing approval needed: ${title}`,
      text,
      html: wrapHtml({
        heading: 'A listing is waiting for your approval',
        buttonLabel: 'Review listings',
        buttonUrl: listingsUrl,
        body: `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${requester} sent ${action} for <strong>${title}</strong>.</p>
          <p style="margin:0;font-size:15px;line-height:1.6">The public website will not change until you approve it in Manage Listings.</p>`,
      }),
    })
  );
}

export async function notifyListingReviewed(project, { actor, decision } = {}) {
  const to = project?.requestedByEmail;
  if (!to) return;
  const title = listingTitle(project);
  const adminName = actor?.name || project?.approverName || 'An admin';
  const listingsUrl = `${adminAppUrl()}/listings`;
  const approved = decision === 'approved';
  const note = String(project?.approvalMessage || '').trim();
  const subject = approved ? `Your listing was approved: ${title}` : `Your listing request was declined: ${title}`;
  const text = approved
    ? `${adminName} approved "${title}". The public listing now uses these changes.\n\n${listingsUrl}`
    : `${adminName} declined "${title}".${note ? `\n\nMessage: ${note}` : ''}\n\nYou can edit it and send it again:\n${listingsUrl}`;
  await safeSend(() =>
    sendMail({
      to,
      subject,
      text,
      html: wrapHtml({
        heading: approved ? 'Your listing changes were approved' : 'Your listing request was declined',
        buttonLabel: 'Open listings',
        buttonUrl: listingsUrl,
        body: approved
          ? `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${adminName} approved <strong>${title}</strong>.</p>
             <p style="margin:0;font-size:15px;line-height:1.6">The public project page now uses these changes.</p>
             ${note ? `<p style="margin:16px 0 0;font-size:14px;line-height:1.6;color:#5c534d">Note from admin: ${note}</p>` : ''}`
          : `<p style="margin:0 0 12px;font-size:15px;line-height:1.6">${adminName} declined <strong>${title}</strong>. The live listing is unchanged.</p>
             ${note ? `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:#5c534d">Message: ${note}</p>` : ''}
             <p style="margin:0;font-size:15px;line-height:1.6">You can edit the listing and send it for approval again.</p>`,
      }),
    })
  );
}
