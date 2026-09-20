import { PlaceholderPage } from '@/components/PlaceholderPage';

export const metadata = { title: 'Forgot Password — Update Me' };

export default function ForgotPasswordPage() {
  return (
    <PlaceholderPage
      title="Forgot Password"
      description="Password reset will be available soon. For now, create a new account if you cannot sign in."
      primaryHref="/register"
      primaryLabel="Create Account"
    />
  );
}
