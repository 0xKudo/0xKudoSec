import { useNavigate } from 'react-router-dom';

const s = {
  page: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    background: 'var(--bg-primary)',
    color: 'var(--text-primary)',
    fontFamily: 'var(--font)',
  },
  scrollArea: {
    flex: 1,
    overflowY: 'auto',
  },
  nav: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '0 32px',
    height: '48px',
    borderBottom: '1px solid var(--border)',
    background: 'var(--bg-surface)',
  },
  brand: {
    fontSize: '16px',
    letterSpacing: '0.04em',
    color: 'var(--text-primary)',
    cursor: 'pointer',
  },
  back: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    background: 'none',
    border: 'none',
    fontFamily: 'var(--font)',
    letterSpacing: '0.04em',
  },
  container: {
    maxWidth: '800px',
    margin: '0 auto',
    padding: '48px 24px 80px',
  },
  h1: {
    fontSize: '18px',
    fontWeight: 'normal',
    letterSpacing: '0.04em',
    marginBottom: '6px',
    color: 'var(--text-primary)',
  },
  updated: {
    fontSize: '11px',
    color: 'var(--text-muted)',
    marginBottom: '40px',
    letterSpacing: '0.04em',
  },
  h2: {
    fontSize: '12px',
    fontWeight: 'normal',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--text-muted)',
    marginTop: '36px',
    marginBottom: '12px',
    borderBottom: '1px solid var(--border)',
    paddingBottom: '8px',
  },
  p: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.7',
    marginBottom: '14px',
  },
  ul: {
    fontSize: '13px',
    color: 'var(--text-primary)',
    lineHeight: '1.7',
    paddingLeft: '20px',
    marginBottom: '14px',
  },
  li: {
    marginBottom: '6px',
  },
  muted: {
    color: 'var(--text-muted)',
  },
};

export function TermsPage() {
  const navigate = useNavigate();

  return (
    <div style={s.page}>
      <nav style={s.nav}>
        <span style={s.brand} onClick={() => navigate('/')}>[ 0xKudo ]</span>
        <button style={s.back} onClick={() => navigate(-1)}>← Back</button>
      </nav>

      <div style={s.scrollArea}><div style={s.container}>
        <h1 style={s.h1}>Terms of Service</h1>
        <div style={s.updated}>Last updated: April 26, 2026</div>

        <p style={s.p}>
          These Terms of Service govern your access to and use of 0xKudo ("the platform"), a cybersecurity operations platform operated by the operator. By creating an account or using the platform, you agree to these terms.
        </p>

        <h2 style={s.h2}>Acceptable Use</h2>
        <p style={s.p}>
          The platform is designed for authorized security monitoring, incident response, and security operations on systems you own or have explicit written authorization to monitor. You agree to use the platform only for lawful purposes and in accordance with these terms.
        </p>
        <p style={s.p}>You must not use the platform to:</p>
        <ul style={s.ul}>
          <li style={s.li}>Monitor, scan, or attack systems you do not own or do not have explicit written authorization to test.</li>
          <li style={s.li}>Conduct unauthorized network reconnaissance, vulnerability scanning, or penetration testing against third-party systems.</li>
          <li style={s.li}>Ingest, store, or process data obtained through unauthorized access to computer systems.</li>
          <li style={s.li}>Interfere with or disrupt the integrity or performance of the platform or its underlying infrastructure.</li>
          <li style={s.li}>Attempt to gain unauthorized access to any part of the platform, its servers, or its databases.</li>
          <li style={s.li}>Use the platform for any purpose that violates applicable local, national, or international law, including the Computer Fraud and Abuse Act (CFAA), the EU Directive on Attacks Against Information Systems, or equivalent legislation in your jurisdiction.</li>
          <li style={s.li}>Resell, sublicense, or provide access to the platform to third parties without authorization.</li>
        </ul>
        <p style={s.p}>
          Violation of these acceptable use terms may result in immediate suspension or termination of your account without notice.
        </p>

        <h2 style={s.h2}>Subscription Terms</h2>
        <p style={s.p}>
          Access to the cloud-hosted SIEM requires an active paid subscription. Subscriptions are billed on a recurring basis (monthly or annually) via Stripe. By subscribing, you authorize Stripe to charge your payment method on each renewal date.
        </p>
        <ul style={s.ul}>
          <li style={s.li}><strong>Billing cycle:</strong> subscriptions renew automatically at the end of each billing period unless cancelled before the renewal date.</li>
          <li style={s.li}><strong>Cancellation:</strong> you may cancel your subscription at any time through the Manage Subscription portal accessible from the Account tab in Configuration. Cancellation takes effect at the end of the current billing period. Access remains active until that date.</li>
          <li style={s.li}><strong>Price changes:</strong> we will provide at least 30 days notice before any price change takes effect. Continued use of the platform after a price change constitutes acceptance of the new pricing.</li>
          <li style={s.li}><strong>Free tier:</strong> the desktop application is provided free of charge and includes all tools running locally on your machine. No subscription is required for desktop use.</li>
          <li style={s.li}><strong>Taxes:</strong> you are responsible for any applicable taxes in your jurisdiction. Stripe may collect and remit taxes where required by law.</li>
        </ul>

        <h2 style={s.h2}>Service Availability</h2>
        <p style={s.p}>
          We aim to provide reliable, continuous access to the platform but do not guarantee uninterrupted availability. The platform is provided on a commercially reasonable efforts basis.
        </p>
        <ul style={s.ul}>
          <li style={s.li}>We may perform scheduled maintenance that temporarily interrupts service. We will make reasonable efforts to schedule maintenance during low-traffic periods.</li>
          <li style={s.li}>We are not liable for downtime caused by factors outside our control, including third-party service failures (Auth0, Stripe, cloud infrastructure providers), DDoS attacks, or force majeure events.</li>
          <li style={s.li}>In the event of extended unplanned outages, we will communicate status updates through available channels.</li>
          <li style={s.li}>We reserve the right to modify, suspend, or discontinue any part of the platform with reasonable advance notice where possible.</li>
        </ul>

        <h2 style={s.h2}>Data and Security</h2>
        <p style={s.p}>
          You retain ownership of all security event data, detection rules, alerts, and cases you create or ingest into the platform. By using the platform, you grant us a limited license to store and process that data solely to provide the service to you.
        </p>
        <p style={s.p}>
          You are responsible for ensuring that any data you ingest into the platform was obtained lawfully and that you have the right to process it in a third-party cloud environment. Do not ingest data that contains personal information beyond what is necessary for security operations.
        </p>
        <p style={s.p}>
          For details on how your data is handled, see our Privacy Policy.
        </p>

        <h2 style={s.h2}>Disclaimer of Warranties</h2>
        <p style={s.p}>
          The platform is provided "as is" and "as available" without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the platform will detect all security threats, that results will be accurate or complete, or that the platform will meet your specific security requirements.
        </p>

        <h2 style={s.h2}>Limitation of Liability</h2>
        <p style={s.p}>
          To the maximum extent permitted by applicable law, the operator shall not be liable for any indirect, incidental, special, consequential, or punitive damages, including loss of data, loss of revenue, or security incidents arising from use of or inability to use the platform, even if advised of the possibility of such damages. Our total liability for any claim arising out of or related to these terms shall not exceed the amount you paid for the service in the twelve months preceding the claim.
        </p>

        <h2 style={s.h2}>Changes to These Terms</h2>
        <p style={s.p}>
          We may update these terms from time to time. We will notify you of material changes by updating the date at the top of this page. Continued use of the platform after changes are posted constitutes acceptance of the revised terms.
        </p>

        <h2 style={s.h2}>Contact</h2>
        <p style={s.p}>
          For questions about these terms, contact the operator via the platform.
        </p>
      </div></div>
    </div>
  );
}
