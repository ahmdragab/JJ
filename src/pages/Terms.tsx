import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export function Terms() {
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
          <h1 className="text-3xl font-bold text-neutral-800 mb-2 font-display">Terms of Service</h1>
          <p className="text-neutral-500 mb-8">Last updated: January 10, 2025</p>

          <div className="prose prose-neutral max-w-none space-y-8">
            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">1. Acceptance of Terms</h2>
              <p className="text-neutral-600 leading-relaxed">
                By accessing or using Alwan Studio ("the Service"), you agree to be bound by these Terms of Service.
                If you do not agree to these terms, please do not use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">2. Description of Service</h2>
              <p className="text-neutral-600 leading-relaxed">
                Alwan Studio is an AI-powered brand design platform that allows users to extract brand guidelines
                from websites and generate AI-powered images and designs. The Service includes brand extraction,
                AI image generation, image editing, and brand asset management features.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">3. Account Registration</h2>
              <p className="text-neutral-600 leading-relaxed">
                To use certain features of the Service, you must create an account using Google Sign-In.
                You are responsible for maintaining the confidentiality of your account and for all activities
                that occur under your account. You agree to notify us immediately of any unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">4. Credits and Payments</h2>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Credit System</h3>
              <p className="text-neutral-600 leading-relaxed">
                The Service operates on a credit-based system. Each AI image generation consumes credits from your account.
                Credits are allocated based on your subscription plan and reset monthly.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Subscriptions</h3>
              <p className="text-neutral-600 leading-relaxed">
                Paid subscriptions are billed in advance on a monthly or annual basis. You can cancel your subscription
                at any time, but no refunds will be provided for the current billing period.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Refunds</h3>
              <p className="text-neutral-600 leading-relaxed">
                Due to the nature of AI-generated content, we generally do not offer refunds for credits consumed.
                If you experience technical issues that prevent you from using purchased credits, please contact us
                at support@alwan.studio.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">5. Acceptable Use</h2>
              <p className="text-neutral-600 leading-relaxed mb-4">
                You agree not to use the Service to:
              </p>
              <ul className="list-disc pl-6 text-neutral-600 space-y-2">
                <li>Generate content that is illegal, harmful, threatening, abusive, defamatory, or otherwise objectionable</li>
                <li>Create content that infringes on intellectual property rights of others</li>
                <li>Generate deceptive deepfakes or content intended to mislead</li>
                <li>Produce content depicting violence, hate speech, or discrimination</li>
                <li>Create adult or sexually explicit content</li>
                <li>Impersonate others or misrepresent your affiliation with any person or entity</li>
                <li>Attempt to bypass or circumvent any security measures or usage limits</li>
                <li>Use the Service for any illegal purpose or in violation of any applicable laws</li>
              </ul>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">6. Intellectual Property</h2>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Your Content</h3>
              <p className="text-neutral-600 leading-relaxed">
                You retain ownership of the brand assets you upload and the images you generate using the Service.
                By using the Service, you grant us a limited license to store and process your content as necessary
                to provide the Service.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Generated Content</h3>
              <p className="text-neutral-600 leading-relaxed">
                Images generated through our AI tools are created for your use. You are granted a license to use,
                modify, and distribute the generated images for personal and commercial purposes, subject to these Terms.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Third-Party Brands</h3>
              <p className="text-neutral-600 leading-relaxed">
                When extracting brand information from websites, you represent that you have the right to use
                such brand assets or are using them for legitimate purposes. We are not responsible for any
                trademark or copyright infringement that may result from your use of extracted brand data.
              </p>

              <h3 className="text-lg font-medium text-neutral-700 mt-6 mb-3">Our Service</h3>
              <p className="text-neutral-600 leading-relaxed">
                The Service, including its design, features, and underlying technology, is owned by Alwan Studio.
                You may not copy, modify, distribute, or reverse engineer any part of the Service.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">7. AI-Generated Content Disclaimer</h2>
              <p className="text-neutral-600 leading-relaxed">
                Content generated by our AI tools may not always be accurate, appropriate, or suitable for your needs.
                You are solely responsible for reviewing and approving any generated content before use.
                We do not guarantee that generated content will be free from errors or unintended outputs.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">8. Service Availability</h2>
              <p className="text-neutral-600 leading-relaxed">
                We strive to maintain high availability of the Service but do not guarantee uninterrupted access.
                The Service may be temporarily unavailable due to maintenance, updates, or circumstances beyond our control.
                We reserve the right to modify, suspend, or discontinue any part of the Service at any time.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">9. Limitation of Liability</h2>
              <p className="text-neutral-600 leading-relaxed">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, ALWAN STUDIO SHALL NOT BE LIABLE FOR ANY INDIRECT,
                INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS OR REVENUES,
                WHETHER INCURRED DIRECTLY OR INDIRECTLY, OR ANY LOSS OF DATA, USE, GOODWILL, OR OTHER INTANGIBLE LOSSES,
                RESULTING FROM YOUR USE OF THE SERVICE.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">10. Indemnification</h2>
              <p className="text-neutral-600 leading-relaxed">
                You agree to indemnify and hold harmless Alwan Studio and its officers, directors, employees,
                and agents from any claims, damages, losses, liabilities, and expenses arising out of your use
                of the Service or violation of these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">11. Termination</h2>
              <p className="text-neutral-600 leading-relaxed">
                We may terminate or suspend your access to the Service at any time, with or without cause,
                with or without notice. Upon termination, your right to use the Service will immediately cease.
                You may delete your account at any time by contacting us.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">12. Changes to Terms</h2>
              <p className="text-neutral-600 leading-relaxed">
                We reserve the right to modify these Terms at any time. We will notify users of any material changes
                by posting the updated Terms on this page. Your continued use of the Service after such changes
                constitutes acceptance of the new Terms.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">13. Governing Law</h2>
              <p className="text-neutral-600 leading-relaxed">
                These Terms shall be governed by and construed in accordance with applicable laws,
                without regard to conflict of law principles.
              </p>
            </section>

            <section>
              <h2 className="text-xl font-semibold text-neutral-800 mb-4">14. Contact Us</h2>
              <p className="text-neutral-600 leading-relaxed">
                If you have any questions about these Terms of Service, please contact us at:{' '}
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
