function isBlankNumber(value) {
  const raw = String(value || '').trim();
  if (!raw || raw === '-') return true;
  return raw.replace(/\D/g, '').length < 9;
}

export function crmApiKey() {
  return String(process.env.CRM_API_KEY || '').trim();
}

export function toCrmContact(inquiry) {
  const viaWa =
    inquiry.source === 'whatsapp' ||
    (!isBlankNumber(inquiry.whatsapp) && isBlankNumber(inquiry.phone));
  const number = viaWa
    ? String(inquiry.whatsapp || '').trim()
    : String(inquiry.phone || inquiry.whatsapp || '').trim();
  const channel = viaWa ? 'whatsapp' : 'call';
  const project = inquiry.projectTitle || 'MyLand';
  const via = channel === 'whatsapp' ? 'WhatsApp' : 'phone';
  return {
    id: inquiry.id,
    number,
    channel,
    project,
    projectSlug: inquiry.projectSlug || '',
    notification: `A user on ${number || 'an unknown number'} contacted MyLand via ${via} about ${project}.`,
    createdAt: inquiry.createdAt,
  };
}

export function requireCrmKey(req, res, next) {
  const expected = crmApiKey();
  if (!expected) {
    res.status(503).json({ message: 'CRM API key is not configured on the server.' });
    return;
  }
  const header = String(req.headers['x-api-key'] || req.headers.authorization || '').trim();
  const provided = header.startsWith('Bearer ') ? header.slice(7).trim() : header;
  if (!provided || provided !== expected) {
    res.status(401).json({ message: 'Invalid CRM API key. Send it as X-API-Key.' });
    return;
  }
  next();
}

export async function notifyCrm(inquiry) {
  const url = String(process.env.CRM_WEBHOOK_URL || '').trim();
  if (!url) return false;
  const payload = toCrmContact(inquiry);
  const key = crmApiKey();
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key } : {}),
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      console.warn(`crm webhook failed: ${res.status}`);
      return false;
    }
    console.log(`crm notified: ${payload.notification}`);
    return true;
  } catch (err) {
    console.warn(`crm webhook skipped: ${err.message}`);
    return false;
  }
}
