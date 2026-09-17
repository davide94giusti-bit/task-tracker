import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, TextField, Typography } from '@mui/material';
import { api } from './api';
import { signOut, updatePassword } from './auth';

type Invite = { id: string; email: string; status: string; invitedAt: string; expiresAt: string; acceptedAt?: string | null; acceptedUserId?: string | null };
type Usage = { acceptedUsers: number; pendingInvitations: number; userLimit: number; pendingDeliveries: number; failedNotifications: number; emailsSentToday: number };

export function PasswordSetup({ mode, onDone }: { mode: 'invite' | 'recovery'; onDone: () => void }) {
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const valid = password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password) && password === confirm;
  return <Stack spacing={2} sx={{ maxWidth: 460, mx: 'auto', mt: 10, p: 3 }}><Typography variant="h4">{mode === 'invite' ? 'Choose your password' : 'Reset your password'}</Typography><Typography color="text.secondary">Use at least 12 characters with upper case, lower case, and a number.</Typography>{error && <Alert severity="error">{error}</Alert>}<TextField type="password" label="New password" value={password} onChange={event => setPassword(event.target.value)} /><TextField type="password" label="Confirm password" value={confirm} onChange={event => setConfirm(event.target.value)} /><Button variant="contained" disabled={!valid || busy} onClick={async () => { setBusy(true); setError(''); try { await updatePassword(password); if (mode === 'invite') await api('/access/accept', { method: 'POST', body: {} }); onDone(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } }}>{busy ? <CircularProgress size={20} /> : mode === 'invite' ? 'Create private workspace' : 'Update password'}</Button></Stack>;
}

const sections = [
  { key: 'pending', title: 'Pending invitations', statuses: ['pending'], color: 'warning' as const },
  { key: 'accepted', title: 'Accepted users', statuses: ['accepted'], color: 'success' as const },
  { key: 'disabled', title: 'Disabled users', statuses: ['disabled'], color: 'default' as const },
  { key: 'closed', title: 'Closed invitations', statuses: ['revoked', 'expired'], color: 'default' as const }
];

export function UsersAccessView() {
  const [items, setItems] = useState<Invite[]>([]), [usage, setUsage] = useState<Usage | null>(null), [email, setEmail] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState(''), [confirm, setConfirm] = useState<Invite | null>(null);
  const load = () => Promise.all([api<Invite[]>('/access/users'), api<Usage>('/access/usage')]).then(([invites, nextUsage]) => { setItems(invites); setUsage(nextUsage); }).catch(reason => setError(reason.message));
  useEffect(() => { void load(); }, []);
  const grouped = useMemo(() => Object.fromEntries(sections.map(section => [section.key, items.filter(item => section.statuses.includes(item.status))])), [items]);
  const act = async (path: string, body: unknown) => { setBusy(true); setError(''); try { await api(path, { method: 'POST', body }); await load(); } catch (reason) { setError((reason as Error).message); } finally { setBusy(false); } };
  return <Stack spacing={2}>
    <Typography variant="h4">Users & access</Typography>
    <Alert severity="info">An invited user receives a separate private workspace and cannot see your data or invite other users. Only the platform administrator has this screen.</Alert>
    <Typography color="text.secondary">The invitation email becomes that user's login and reminder-email address. They choose whether to enable reminder emails in their own Settings.</Typography>
    {error && <Alert severity="error">{error}</Alert>}
    {!usage && <LinearProgress />}
    {usage && <Card><CardContent><Typography>{usage.acceptedUsers} accepted · {usage.pendingInvitations} pending · limit {usage.userLimit}</Typography><Typography variant="body2" color="text.secondary">{usage.pendingDeliveries} pending deliveries · {usage.failedNotifications} failed · {usage.emailsSentToday} emails today</Typography></CardContent></Card>}
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}><TextField fullWidth label="Email to invite" value={email} onChange={event => setEmail(event.target.value)} /><Button variant="contained" disabled={busy || !email} onClick={() => act('/access/invite', { email }).then(() => setEmail(''))}>Invite user</Button></Stack>
    {sections.map(section => {
      const group = grouped[section.key] || [];
      return <Box key={section.key}>
        <Stack direction="row" alignItems="center" spacing={1} mb={1}><Typography variant="h6">{section.title}</Typography><Chip size="small" color={section.color} label={group.length} /></Stack>
        {!group.length ? <Typography color="text.secondary" variant="body2" sx={{ mb: 2 }}>No {section.title.toLowerCase()}.</Typography> : <Stack spacing={1}>{group.map(invite => <Card key={invite.id} variant="outlined"><CardContent><Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1}><Box><Typography fontWeight={700} sx={{ overflowWrap: 'anywhere' }}>{invite.email}</Typography><Stack direction="row" spacing={1} alignItems="center" mt={0.5}><Chip size="small" label={invite.status} color={invite.status === 'accepted' ? 'success' : invite.status === 'pending' ? 'warning' : 'default'} /><Typography variant="body2" color="text.secondary">Invited {new Date(invite.invitedAt).toLocaleDateString()}</Typography></Stack></Box>{invite.status === 'pending' && <Stack direction="row"><Button disabled={busy} onClick={() => act('/access/resend', { invitationId: invite.id })}>Resend</Button><Button color="error" disabled={busy} onClick={() => setConfirm(invite)}>Revoke</Button></Stack>}</Stack></CardContent></Card>)}</Stack>}
      </Box>;
    })}
    <Dialog open={!!confirm} onClose={() => setConfirm(null)}><DialogTitle>Revoke invitation?</DialogTitle><DialogContent>This invitation will no longer be usable.</DialogContent><DialogActions><Button onClick={() => setConfirm(null)}>Cancel</Button><Button color="error" onClick={() => { const invite = confirm; setConfirm(null); if (invite) void act('/access/revoke', { invitationId: invite.id }); }}>Revoke</Button></DialogActions></Dialog>
  </Stack>;
}

export function AccountSecurity() {
  const [password, setPassword] = useState(''), [message, setMessage] = useState('');
  return <Stack spacing={2}><Typography variant="h4">Security</Typography>{message && <Alert severity={message === 'Password changed.' ? 'success' : 'error'}>{message}</Alert>}<TextField type="password" label="New password" helperText="At least 12 characters, upper/lower case, and a number" value={password} onChange={event => setPassword(event.target.value)} /><Button variant="contained" onClick={() => updatePassword(password).then(() => setMessage('Password changed.')).catch(reason => setMessage(reason.message))}>Change password</Button><Button color="error" onClick={() => signOut('global').then(() => location.reload())}>Sign out all sessions</Button></Stack>;
}
