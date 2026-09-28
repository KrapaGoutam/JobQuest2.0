import { type FormEvent, useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Lock, UserPlus, KeyRound } from 'lucide-react';

export interface AuthViewProps {
  onRegister: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRecover: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  authError?: string | null;
}

export function AuthView({
  onRegister,
  onLogin,
  onRecover,
  authError,
}: AuthViewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (
    e: FormEvent<HTMLFormElement>,
    fn: (e: FormEvent<HTMLFormElement>) => Promise<void>,
  ) => {
    setIsSubmitting(true);
    try {
      await fn(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        background: 'var(--color-canvas)',
      }}
    >
      {/* Top Brand Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: '960px',
          marginBottom: '24px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--color-accent)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 800,
              fontSize: '16px',
            }}
          >
            JQ
          </div>
          <div>
            <span style={{ fontWeight: 700, fontSize: '16px' }}>JobQuest 2.0</span>
            <span className="muted xs" style={{ marginLeft: '6px' }}>M2 Design System</span>
          </div>
          <StatusBadge variant="accent">Auth Option B</StatusBadge>
        </div>

        <ThemeToggle />
      </div>

      {authError && (
        <div
          role="alert"
          style={{
            width: '100%',
            maxWidth: '960px',
            padding: '10px 14px',
            marginBottom: '16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-danger-soft)',
            color: 'var(--color-danger)',
            border: '1px solid var(--color-danger)',
            fontSize: '13px',
          }}
        >
          {authError}
        </div>
      )}

      {/* Grid of the three forms to ensure Playwright can locate Register, Sign in, and Recover simultaneously */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '20px',
          width: '100%',
          maxWidth: '960px',
        }}
      >
        {/* Register Form */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={16} className="primary-t" />
              <CardTitle>Register</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <form
              aria-label="Register"
              onSubmit={(e) => handleSubmit(e, onRegister)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <FormField label="Username (required)" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="username"
                    required
                    autoComplete="username"
                    placeholder="e.g. alex_chen"
                  />
                )}
              </FormField>

              <FormField label="Password (required)" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="Min. 10 chars"
                  />
                )}
              </FormField>

              <FormField label="Email (optional)" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    name="email"
                    type="email"
                    placeholder="For alerts (never used in JWT)"
                  />
                )}
              </FormField>

              <FormField label="Phone (optional)" optional>
                {({ id }) => (
                  <Input
                    id={id}
                    name="phone"
                    placeholder="Optional SMS notifications"
                  />
                )}
              </FormField>

              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmitting}
                style={{ width: '100%', marginTop: '6px' }}
              >
                Create account
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Sign In Form */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Lock size={16} className="primary-t" />
              <CardTitle>Sign in</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <form
              aria-label="Sign in"
              onSubmit={(e) => handleSubmit(e, onLogin)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <FormField label="Username" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="username"
                    required
                    autoComplete="username"
                    placeholder="Your account username"
                  />
                )}
              </FormField>

              <FormField label="Password" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="password"
                    type="password"
                    required
                    autoComplete="current-password"
                    placeholder="Account password"
                  />
                )}
              </FormField>

              <div style={{ minHeight: '84px', display: 'flex', alignItems: 'center' }}>
                <p className="muted small" style={{ margin: 0 }}>
                  JobQuest 2.0 uses Argon2id password hashing and ES256 asymmetric JWT authentication with single-use rotating refresh cookies.
                </p>
              </div>

              <Button
                variant="primary"
                type="submit"
                isLoading={isSubmitting}
                style={{ width: '100%', marginTop: '6px' }}
              >
                Sign in
              </Button>
            </form>
          </CardBody>
        </Card>

        {/* Recover Form */}
        <Card>
          <CardHeader>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <KeyRound size={16} className="primary-t" />
              <CardTitle>Recover account</CardTitle>
            </div>
          </CardHeader>
          <CardBody>
            <form
              aria-label="Recover account"
              onSubmit={(e) => handleSubmit(e, onRecover)}
              style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <FormField label="Username" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="username"
                    required
                    placeholder="Target username"
                  />
                )}
              </FormField>

              <FormField label="Recovery code" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="code"
                    required
                    placeholder="Single-use backup code"
                  />
                )}
              </FormField>

              <FormField label="New password" required>
                {({ id }) => (
                  <Input
                    id={id}
                    name="password"
                    type="password"
                    required
                    autoComplete="new-password"
                    placeholder="Create a fresh password"
                  />
                )}
              </FormField>

              <Button
                variant="secondary"
                type="submit"
                isLoading={isSubmitting}
                style={{ width: '100%', marginTop: '6px' }}
              >
                Reset password
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <p className="muted xs">
          Direction D Design System · JobQuest 2.0 Foundation · Milestone 2
        </p>
      </div>
    </div>
  );
}
