import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function Privacy() {
  return (
    <div className="min-h-screen gradient-surface py-16 px-4 page-enter">
      <div className="max-w-3xl mx-auto">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-neutral-500 hover:text-neutral-700 transition-colors mb-8"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <div className="card p-8 md:p-12">
          <h1 className="text-3xl font-bold text-neutral-800 mb-2 font-display">Privacy Policy</h1>
          <p className="text-neutral-500 mb-8">Last updated: January 10, 2025</p>

          <div className="prose prose-neutral max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">1. Introduction</h2>
              <p className="text-neutral-600 leading-relaxed">
                Alwan Studio ("we," "our," or "us") operates the alwan.studio website and AI-powered brand design platform.
                This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">2. Information We Collect</h2>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Account Information</h3>
              <p className="text-neutral-600 leading-relaxed">
                When you create an account using Google Sign-In, we receive your name, email address, and profile picture
                from Google. We use this information to create and manage your account.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Brand Data</h3>
              <p className="text-neutral-600 leading-relaxed">
                When you use our brand extraction feature, we analyze publicly available information from websites you provide,
                including logos, colors, fonts, and brand guidelines. This data is stored in your account to enable our design services.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Generated Content</h3>
              <p className="text-neutral-600 leading-relaxed">
                We store images and designs you generate using our AI tools, along with the prompts and editing history,
                to provide you with access to your creations and enable iterative editing.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Usage Data</h3>
              <p className="text-neutral-600 leading-relaxed">
                We collect information about how you interact with our service, including pages visited, features used,
                and actions taken. This helps us improve our platform and troubleshoot issues.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Payment Information</h3>
              <p className="text-neutral-600 leading-relaxed">
                Payment processing is handled by Stripe. We do not store your credit card details.
                We only receive confirmation of successful transactions and subscription status from Stripe.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">3. How We Use Your Information</h2>
              <ul className="list-disc pl-6 text-neutral-600 space-y-2">
                <li>To provide and maintain our AI design services</li>
                <li>To process your transactions and manage your credits</li>
                <li>To send you service-related communications</li>
                <li>To improve and personalize your experience</li>
                <li>To detect and prevent fraud or abuse</li>
                <li>To comply with legal obligations</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">4. Third-Party Services</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                We use third-party services to operate our platform, including:
              </p>
              <ul className="list-disc pl-6 text-neutral-600 space-y-2">
                <li><strong>Authentication providers</strong> (e.g., Google Sign-In)</li>
                <li><strong>Payment processors</strong> (e.g., Stripe)</li>
                <li><strong>AI service providers</strong> for image and text generation</li>
                <li><strong>Cloud infrastructure</strong> for database and hosting</li>
                <li><strong>Analytics and monitoring</strong> tools for error tracking</li>
              </ul>
              <p className="text-neutral-600 leading-relaxed mt-4">
                Each of these services has their own privacy policies governing their use of data.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">5. Data Storage and Security</h2>
              <p className="text-neutral-600 leading-relaxed">
                Your data is stored securely using cloud infrastructure.
                We implement appropriate technical and organizational measures to protect your personal information
                against unauthorized access, alteration, disclosure, or destruction.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">6. Data Retention</h2>
              <p className="text-neutral-600 leading-relaxed">
                We retain your account data and generated content for as long as your account is active.
                You can delete your brands and generated images at any time. If you wish to delete your account entirely,
                please contact us at support@alwan.studio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">7. Your Rights</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                Depending on your location, you may have the following rights:
              </p>
              <ul className="list-disc pl-6 text-neutral-600 space-y-2">
                <li>Access and receive a copy of your personal data</li>
                <li>Rectify inaccurate personal data</li>
                <li>Request deletion of your personal data</li>
                <li>Object to or restrict processing of your data</li>
                <li>Data portability</li>
              </ul>
              <p className="text-neutral-600 leading-relaxed mt-4">
                To exercise these rights, contact us at support@alwan.studio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">8. Cookies</h2>
              <p className="text-neutral-600 leading-relaxed">
                We use essential cookies to maintain your session and authentication state.
                We do not use third-party tracking cookies for advertising purposes.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">9. Children's Privacy</h2>
              <p className="text-neutral-600 leading-relaxed">
                Our service is not intended for users under the age of 13. We do not knowingly collect
                personal information from children under 13.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">10. Changes to This Policy</h2>
              <p className="text-neutral-600 leading-relaxed">
                We may update this Privacy Policy from time to time. We will notify you of any changes
                by posting the new Privacy Policy on this page and updating the "Last updated" date.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">11. Contact Us</h2>
              <p className="text-neutral-600 leading-relaxed">
                If you have any questions about this Privacy Policy, please contact us at:{' '}
                <a href="mailto:support@alwan.studio" className="text-brand-primary hover:text-brand-primary-hover transition-colors">
                  support@alwan.studio
                </a>
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
