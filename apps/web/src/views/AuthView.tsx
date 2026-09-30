/* eslint-disable @typescript-eslint/no-unused-vars */
import { type FormEvent, useState } from 'react';
import { Card, CardHeader, CardTitle, CardBody } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { FormField } from '../components/ui/FormField';
import { ThemeToggle } from '../components/ui/ThemeToggle';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Lock, UserPlus, KeyRound, ArrowLeft, History } from 'lucide-react';

export interface AuthViewProps {
  onRegister: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onLogin: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onRecover: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  onClaim?: (e: FormEvent<HTMLFormElement>) => Promise<void>;
  authError?: string | null;
}

type AuthMode = 'signin' | 'register' | 'recover' | 'claim';

export function AuthView({
  onRegister,
  onLogin,
  onRecover,
  onClaim,
  authError,
}: AuthViewProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mode, setMode] = useState<AuthMode>('signin');

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
          maxWidth: '440px',
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
        </div>

        <ThemeToggle />
      </div>

      {authError && (
        <div
          role="alert"
          style={{
            width: '100%',
            maxWidth: '440px',
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

      <div
        style={{
          width: '100%',
          maxWidth: '440px',
        }}
      >
        {mode === 'signin' && (
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

                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isSubmitting}
                  style={{ width: '100%', marginTop: '6px' }}
                >
                  Sign in
                </Button>
              </form>

              <div style={{ marginTop: '24px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                <Button variant="ghost" onClick={() => setMode('register')}>
                  Create account
                </Button>
                <Button variant="ghost" onClick={() => setMode('recover')}>
                  Forgot password?
                </Button>
                {onClaim && (
                  <Button variant="ghost" onClick={() => setMode('claim')}>
                    Migrated from JobQuest 1.0? Claim your account
                  </Button>
                )}
              </div>
            </CardBody>
          </Card>
        )}

        {mode === 'register' && (
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

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <Button variant="ghost" onClick={() => setMode('signin')}>
                  <ArrowLeft size={14} style={{ marginRight: '6px' }} />
                  Back to sign in
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {mode === 'recover' && (
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

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <Button variant="ghost" onClick={() => setMode('signin')}>
                  <ArrowLeft size={14} style={{ marginRight: '6px' }} />
                  Back to sign in
                </Button>
              </div>
            </CardBody>
          </Card>
        )}

        {mode === 'claim' && onClaim && (
          <Card>
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <History size={16} className="primary-t" />
                <CardTitle>Claim migrated account</CardTitle>
              </div>
            </CardHeader>
            <CardBody>
              <form
                aria-label="Claim account"
                onSubmit={(e) => handleSubmit(e, onClaim)}
                style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}
              >
                <FormField label="Username" required>
                  {({ id }) => (
                    <Input
                      id={id}
                      name="username"
                      required
                      placeholder="Migrated username"
                    />
                  )}
                </FormField>

                <FormField label="Migration claim code" required>
                  {({ id }) => (
                    <Input
                      id={id}
                      name="code"
                      required
                      placeholder="Code provided for migration"
                    />
                  )}
                </FormField>

                <FormField label="Choose new password" required>
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

                <Button
                  variant="primary"
                  type="submit"
                  isLoading={isSubmitting}
                  style={{ width: '100%', marginTop: '6px' }}
                >
                  Claim account
                </Button>
              </form>

              <div style={{ marginTop: '16px', textAlign: 'center' }}>
                <Button variant="ghost" onClick={() => setMode('signin')}>
                  <ArrowLeft size={14} style={{ marginRight: '6px' }} />
                  Back to sign in
                </Button>
              </div>
            </CardBody>
          </Card>
        )}
      </div>

      <div style={{ marginTop: '24px', textAlign: 'center' }}>
        <p className="muted xs">
          JobQuest 2.0 Foundation · Milestone 15
        </p>
      </div>
    </div>
  );
}
