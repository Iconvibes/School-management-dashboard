/**
 * HTML email templates for EduTrack notifications.
 */

const naira = (n) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(Number(n) || 0);

function shell(title, bodyHtml, brandColor) {
  brandColor = brandColor || '#2563EB';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;padding:0;background:#f4f6f8;font-family:sans-serif;">'
    + '<table width="100%" style="background:#f4f6f8;padding:32px 16px;"><tr><td align="center">'
    + '<table width="100%" style="max-width:560px;background:#fff;border-radius:12px;overflow:hidden;">'
    + '<tr><td style="background:' + brandColor + ';padding:20px 28px;"><h1 style="margin:0;color:#fff;font-size:18px;">' + title + '</h1></td></tr>'
    + '<tr><td style="padding:28px;">' + bodyHtml + '</td></tr>'
    + '<tr><td style="background:#f9fafb;padding:16px 28px;border-top:1px solid #e5e7eb;"><p style="margin:0;font-size:12px;color:#9ca3af;">Sent by EduTrack</p></td></tr>'
    + '</table></td></tr></table></body></html>';
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function feeReminderParent({ studentName, className, balance, schoolName, message, brandColor }) {
  var n = esc(studentName);
  var c = esc(className || '—');
  var b = naira(balance);
  var s = esc(schoolName || "Your child’s school");
  var body = esc(message || '').split('\n').join('<br>');

  var html = shell('Fee Reminder · ' + studentName,
    '<p style="margin:0 0 16px;color:#374151;font-size:15px;">Dear Parent,</p>'
    + '<p style="margin:0 0 16px;color:#374151;font-size:15px;">This is a friendly fee reminder from <strong>' + s + '</strong>.</p>'
    + '<table width="100%" style="margin:16px 0;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;"><tr><td style="padding:16px;">'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Student</p>'
    + '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">' + n + ' — ' + c + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Outstanding Balance</p>'
    + '<p style="margin:0;font-size:22px;font-weight:700;color:#dc2626;">' + esc(b) + '</p>'
    + '</td></tr></table>'
    + (body
      ? '<div style="margin:16px 0;padding:12px 16px;background:#eff6ff;border-left:4px solid ' + (brandColor || '#2563EB') + ';"><p style="margin:0;color:#1e40af;font-size:14px;">' + body + '</p></div>'
      : '')
    + '<p style="margin:16px 0 0;color:#374151;font-size:15px;">Kindly complete this term’s fee payment at your earliest convenience.</p>'
    + '<p style="margin:16px 0 0;color:#374151;font-size:15px;">Thank you,<br><strong>' + s + '</strong></p>',
    brandColor);

  var text = [
    'Dear Parent,',
    '',
    'This is a friendly fee reminder from ' + (schoolName || "your child's school") + '.',
    '',
    '  Student: ' + studentName + ' — ' + (className || '—'),
    '  Outstanding Balance: ' + b,
    '',
    message || '',
    '',
    'Kindly complete this term’s fee payment at your earliest convenience.',
    '',
    'Thank you,',
    schoolName || 'The School Office'
  ].filter(Boolean).join('\n');

  return { subject: 'Fee Reminder — ' + studentName, text: text, html: html };
}

export function feeReminderStudent({ studentName, className, balance, schoolName, message, brandColor }) {
  var n = esc(studentName);
  var c = esc(className || '—');
  var b = naira(balance);
  var s = esc(schoolName || 'Your school');
  var body = esc(message || '').split('\n').join('<br>');

  var html = shell('Fee Reminder · ' + studentName,
    '<p style="margin:0 0 16px;color:#374151;font-size:15px;">Dear ' + n + ',</p>'
    + '<p style="margin:0 0 16px;color:#374151;font-size:15px;">This is a friendly reminder from <strong>' + s + '</strong>.</p>'
    + '<table width="100%" style="margin:16px 0;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;"><tr><td style="padding:16px;">'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Class</p>'
    + '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">' + c + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Outstanding Balance</p>'
    + '<p style="margin:0;font-size:22px;font-weight:700;color:#dc2626;">' + esc(b) + '</p>'
    + '</td></tr></table>'
    + (body
      ? '<div style="margin:16px 0;padding:12px 16px;background:#eff6ff;border-left:4px solid ' + (brandColor || '#2563EB') + ';"><p style="margin:0;color:#1e40af;font-size:14px;">' + body + '</p></div>'
      : '')
    + '<p style="margin:16px 0 0;color:#374151;font-size:15px;">Kindly complete this term’s fee payment at your earliest convenience.</p>'
    + '<p style="margin:16px 0 0;color:#374151;font-size:15px;">Thank you,<br><strong>' + s + '</strong></p>',
    brandColor);

  var text = [
    'Dear ' + studentName,
    '',
    'This is a friendly reminder from ' + (schoolName || 'your school') + '.',
    '',
    '  Class: ' + (className || '—'),
    '  Outstanding Balance: ' + b,
    '',
    message || '',
    '',
    'Kindly complete this term’s fee payment at your earliest convenience.',
    '',
    'Thank you,',
    schoolName || 'The School Office'
  ].filter(Boolean).join('\n');

  return { subject: 'Fee Reminder — ' + studentName, text: text, html: html };
}

export function paymentNotification({ studentName, className, parentName, amount, receiptNo, method, schoolName, brandColor }) {
  var n = esc(studentName || 'a student');
  var c = esc(className || '—');
  var p = esc(parentName || 'A parent');
  var a = naira(amount);
  var r = esc(receiptNo || '—');

  var html = shell('New Fee Payment · ' + (receiptNo || '—'),
    '<p style="margin:0 0 16px;color:#374151;font-size:15px;">A new fee payment has been submitted and is awaiting confirmation.</p>'
    + '<table width="100%" style="margin:16px 0;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;"><tr><td style="padding:16px;">'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">From</p>'
    + '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">' + p + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Student</p>'
    + '<p style="margin:0 0 12px;font-size:15px;font-weight:600;color:#111827;">' + n + ' — ' + c + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Amount</p>'
    + '<p style="margin:0 0 12px;font-size:22px;font-weight:700;color:#059669;">' + esc(a) + '</p>'
    + '<p style="margin:0 0 8px;font-size:13px;color:#6b7280;">Receipt</p>'
    + '<p style="margin:0;font-size:15px;font-weight:600;color:#111827;">' + r + '</p>'
    + '</td></tr></table>'
    + '<p style="margin:16px 0 0;color:#374151;font-size:15px;">Confirm this payment in Fee Management.</p>',
    brandColor);

  var text = [
    'A new fee payment is awaiting your confirmation.',
    '',
    '  From:    ' + (parentName || 'A parent'),
    '  Student: ' + (studentName || 'A student') + ' — ' + (className || '—'),
    '  Amount:  ' + a,
    '  Receipt: ' + (receiptNo || '—'),
    '  Method:  ' + (method || '—'),
    '',
    'Confirm this payment in Fee Management.'
  ].join('\n');

  return { subject: 'New Fee Payment · ' + (receiptNo || '—'), text: text, html: html };
}
