export const escapeHtml = (value: string) => value.replace(/[&<>'"]/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]!));

export type NotificationEmailInput = {
  title: string;
  dateLabel?: string;
  url: string;
  kind: string;
  summary?: string;
  actionLabel?: string;
  details?: Array<{ label: string; value?: string | null }>;
};

export function reminderEmail(input: NotificationEmailInput) {
  const title = escapeHtml(input.title),
    kind = escapeHtml(input.kind),
    summary = escapeHtml(input.summary || 'You have an update that may need your attention.'),
    actionLabel = escapeHtml(input.actionLabel || 'Open in Task Tracker'),
    url = escapeHtml(input.url),
    details = [
      ...(input.dateLabel ? [{ label: 'When', value: input.dateLabel }] : []),
      ...(input.details || []),
    ].filter(detail => detail.value),
    textDetails = details.map(detail => `${detail.label}: ${detail.value}`).join('\n'),
    htmlDetails = details.length ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0;border:1px solid #dbe3ef;border-radius:10px;border-collapse:separate;overflow:hidden">${details.map((detail, index) => `<tr><td style="padding:10px 12px;color:#64748b;font-size:13px;border-top:${index ? '1px solid #e7edf5' : '0'};width:34%">${escapeHtml(detail.label)}</td><td style="padding:10px 12px;color:#172033;font-size:14px;font-weight:600;border-top:${index ? '1px solid #e7edf5' : '0'}">${escapeHtml(String(detail.value))}</td></tr>`).join('')}</table>` : '';
  return {
    subject: `${input.kind}: ${input.title}`,
    text: `Task Tracker\n${input.kind}\n\n${input.title}\n${input.summary || 'You have an update that may need your attention.'}${textDetails ? `\n\n${textDetails}` : ''}\n\n${input.actionLabel || 'Open in Task Tracker'}: ${input.url}\n\nThis message was sent because notifications are enabled for your Task Tracker account.`,
    html: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head><body style="margin:0;background:#eef3f9;font-family:Inter,Segoe UI,Arial,sans-serif;color:#172033"><div style="display:none;max-height:0;overflow:hidden;color:transparent">${summary}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#eef3f9;padding:24px 12px"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #dbe3ef;border-radius:16px;overflow:hidden"><tr><td style="padding:22px 28px;background:#10213d;color:#ffffff"><div style="font-size:18px;font-weight:800;letter-spacing:.2px">Task Tracker</div><div style="margin-top:4px;color:#bfdbfe;font-size:13px">Connected workspace notification</div></td></tr><tr><td style="padding:30px 28px"><div style="display:inline-block;padding:5px 10px;border-radius:999px;background:#dbeafe;color:#1d4ed8;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.5px">${kind}</div><h1 style="margin:16px 0 8px;font-size:25px;line-height:1.25;color:#111827">${title}</h1><p style="margin:0;color:#526078;font-size:16px;line-height:1.55">${summary}</p>${htmlDetails}<a href="${url}" style="display:inline-block;background:#1d4ed8;color:#ffffff;text-decoration:none;padding:13px 20px;border-radius:9px;font-weight:800;font-size:15px">${actionLabel}</a><p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.5">The button opens this exact item. On supported devices, an installed Task Tracker app handles the link. If sign-in is required, the destination is retained after authentication.</p><p style="margin:12px 0 0;color:#94a3b8;font-size:11px;line-height:1.45;word-break:break-all">Button not working? Open: ${url}</p></td></tr><tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e7edf5;color:#64748b;font-size:12px;line-height:1.5">You received this message because email notifications are enabled in Task Tracker. Notification preferences can be changed from Settings.</td></tr></table></td></tr></table></body></html>`,
  };
}
