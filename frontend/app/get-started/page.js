import { redirect } from 'next/navigation';

export default function GetStartedRedirect() {
  redirect('/register');
}
