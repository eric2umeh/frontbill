import { Resend } from 'resend'

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  receptionist: 'Receptionist',
  accountant: 'Accountant',
  housekeeping: 'Housekeeping',
  staff: 'Staff',
}

const ROLE_PERMISSIONS: Record<string, string[]> = {
  admin: [
    'Full access to all modules',
    'Manage users and roles',
    'View all reports and analytics',
    'Configure system settings',
  ],
  manager: [
    'Manage bookings and reservations',
    'View revenue reports',
    'Manage guests and folios',
    'Add and edit charges',
  ],
  receptionist: [
    'Create and manage bookings',
    'Check guests in and out',
    'View and manage folios',
    'Record payments',
  ],
  accountant: [
    'View financial reports',
    'Manage city ledger accounts',
    'Process settlements',
    'Export transaction history',
  ],
  housekeeping: [
    'View room status',
    'Update housekeeping tasks',
    'Mark rooms as clean or dirty',
  ],
  staff: [
    'View assigned bookings',
    'Basic operational access',
  ],
}

function buildEmailHtml({
  full_name,
  email,
  password,
  role,
  site_url,
  org_name,
}: {
  full_name: string
  email: string
  password: string
  role: string
  site_url: string
  org_name: string
}) {
  const roleLabel = ROLE_LABELS[role] || role
  const permissions = ROLE_PERMISSIONS[role] || ['Access based on assigned role']

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Welcome to ${org_name}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="580" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0f172a;padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.5px;">${org_name}</h1>
              <p style="margin:8px 0 0;color:#94a3b8;font-size:14px;">Hotel Management System</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 8px;color:#64748b;font-size:14px;">Hello,</p>
              <h2 style="margin:0 0 24px;color:#0f172a;font-size:20px;font-weight:600;">Welcome, ${full_name}!</h2>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Your account has been created on <strong>${org_name}</strong>&apos;s hotel management platform. 
                You can now log in using the credentials below.
              </p>

              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:24px;">
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#94a3b8;text-transform:uppercase;">Login URL</p>
                    <p style="margin:0 0 16px;">
                      <a href="${site_url}" style="color:#2563eb;font-size:15px;text-decoration:none;font-weight:500;">${site_url}</a>
                    </p>
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#94a3b8;text-transform:uppercase;">Email Address</p>
                    <p style="margin:0 0 16px;color:#0f172a;font-size:15px;font-weight:500;">${email}</p>
                    <p style="margin:0 0 4px;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#94a3b8;text-transform:uppercase;">Temporary Password</p>
                    <p style="margin:0;background:#0f172a;color:#f8fafc;font-family:'Courier New',monospace;font-size:16px;font-weight:700;padding:10px 14px;border-radius:6px;display:inline-block;letter-spacing:1px;">${password}</p>
                  </td>
                </tr>
              </table>

              <!-- Role Badge -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <p style="margin:0 0 12px;font-size:11px;font-weight:600;letter-spacing:0.8px;color:#3b82f6;text-transform:uppercase;">Your Role</p>
                    <p style="margin:0 0 12px;color:#1e40af;font-size:16px;font-weight:700;">${roleLabel}</p>
                    <p style="margin:0 0 10px;font-size:13px;color:#475569;font-weight:600;">Your access includes:</p>
                    <ul style="margin:0;padding-left:18px;">
                      ${permissions.map(p => `<li style="color:#475569;font-size:13px;line-height:1.8;">${p}</li>`).join('')}
                    </ul>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;margin-bottom:32px;">
                <tr>
                  <td style="padding:16px 20px;">
                    <p style="margin:0;color:#9a3412;font-size:13px;line-height:1.6;">
                      <strong>Security notice:</strong> This is a temporary password. You are advised to change it after your first login via your profile settings.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${site_url}" style="display:inline-block;background:#0f172a;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                      Log In Now
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:24px 40px;text-align:center;">
              <p style="margin:0;color:#94a3b8;font-size:12px;line-height:1.6;">
                This email was sent by ${org_name}. If you did not expect this, please contact your administrator.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim()
}

export async function sendWelcomeEmail({
  full_name,
  email,
  password,
  role,
  site_url,
  org_name,
}: {
  full_name: string
  email: string
  password: string
  role: string
  site_url: string
  org_name: string
}) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  const from = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev'
  const roleLabel = ROLE_LABELS[role] || role

  const { data, error } = await resend.emails.send({
    from,
    to: email,
    subject: `Welcome to ${org_name} — Your login details`,
    html: buildEmailHtml({ full_name, email, password, role, site_url, org_name }),
    text: `Welcome to ${org_name}, ${full_name}!\n\nYour account has been created.\n\nLogin URL: ${site_url}\nEmail: ${email}\nTemporary Password: ${password}\nRole: ${roleLabel}\n\nPlease change your password after your first login.`,
  })

  if (error) {
    console.error('Failed to send welcome email:', error)
    throw error
  }

  return data
}
