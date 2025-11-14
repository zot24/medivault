import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const { email, firstName, lastName, source } = req.body;

    // Validate required fields
    if (!email || !firstName) {
      return res.status(400).json({
        message: 'Email and first name are required'
      });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        message: 'Invalid email address'
      });
    }

    // Validate environment variables
    if (!process.env.FROM_EMAIL) {
      console.error('FROM_EMAIL environment variable is not set');
      return res.status(500).json({
        message: 'Email service is not configured. Please contact support.'
      });
    }

    const fullName = lastName ? `${firstName} ${lastName}` : firstName;

    // Send confirmation email to the user
    await resend.emails.send({
      from: `MediVault <${process.env.FROM_EMAIL}>`,
      to: [email],
      subject: "You're on the MediVault Waitlist! 🎉",
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="color: white; margin: 0; font-size: 28px;">Welcome to MediVault! 🚀</h1>
            </div>

            <div style="background: #ffffff; padding: 40px 30px; border-radius: 0 0 10px 10px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
              <h2 style="color: #333; margin-top: 0;">Hi ${fullName}! 👋</h2>

              <p style="font-size: 16px; color: #555;">
                Thank you for joining the MediVault waitlist! We're thrilled to have you on board.
              </p>

              <p style="font-size: 16px; color: #555;">
                MediVault is building the future of health intelligence - where AI transforms how you understand and manage your medical data. No more drowning in paperwork, no more fragmented records, just clear, actionable insights about your health.
              </p>

              <div style="background: linear-gradient(135deg, #667eea15 0%, #764ba215 100%); border-left: 4px solid #667eea; padding: 20px; margin: 25px 0; border-radius: 5px;">
                <h3 style="margin-top: 0; color: #667eea;">What to expect:</h3>
                <ul style="margin: 10px 0; padding-left: 20px;">
                  <li style="margin: 8px 0;">🎯 <strong>Early Access:</strong> Be first to experience AI-powered health intelligence</li>
                  <li style="margin: 8px 0;">📊 <strong>Smart Insights:</strong> Our AI analyzes patterns you'd never notice</li>
                  <li style="margin: 8px 0;">🔒 <strong>Privacy First:</strong> Your health data, completely secure and private</li>
                  <li style="margin: 8px 0;">💡 <strong>Exclusive Updates:</strong> Get behind-the-scenes peeks at features we're building</li>
                </ul>
              </div>

              <p style="font-size: 16px; color: #555;">
                We're working hard to launch soon. Keep an eye on your inbox - we'll notify you the moment MediVault is ready for you.
              </p>

              <p style="font-size: 16px; color: #555;">
                Have questions? Just hit reply to this email. We'd love to hear from you!
              </p>

              <p style="font-size: 16px; color: #555; margin-top: 30px;">
                To better health,<br>
                <strong>The MediVault Team</strong>
              </p>
            </div>

            <div style="text-align: center; padding: 20px; color: #999; font-size: 12px;">
              <p>
                You're receiving this because you signed up for the MediVault waitlist${source !== 'unknown' ? ` via ${source}` : ''}.
              </p>
              <p style="margin-top: 10px;">
                © 2024 MediVault. All rights reserved.
              </p>
            </div>
          </body>
        </html>
      `,
    });

    // Send notification to admin
    if (process.env.NOTIFICATION_EMAIL) {
      await resend.emails.send({
        from: `MediVault Waitlist <${process.env.FROM_EMAIL}>`,
        to: [process.env.NOTIFICATION_EMAIL],
        subject: `New Waitlist Signup: ${fullName}`,
        html: `
          <h2>New MediVault Waitlist Signup</h2>
          <p><strong>Name:</strong> ${fullName}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Source:</strong> ${source || 'unknown'}</p>
          <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
        `,
      });
    }

    return res.status(200).json({
      message: 'Successfully joined the waitlist',
      email
    });

  } catch (error: any) {
    console.error('Waitlist signup error:', error);

    return res.status(500).json({
      message: 'Failed to join waitlist. Please try again.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}
