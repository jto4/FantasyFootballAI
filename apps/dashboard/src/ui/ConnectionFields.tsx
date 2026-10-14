const connectionFields: Record<string, { key: string; label: string; secret?: boolean }[]> = {
  resend: [
    { key: 'apiKey', label: 'Resend API key', secret: true },
    { key: 'from', label: 'Sender email address' },
  ],
  twilio: [
    { key: 'accountSid', label: 'Twilio Account SID' },
    { key: 'authToken', label: 'Twilio auth token', secret: true },
    { key: 'from', label: 'Sending phone number (optional for groups)' },
  ],
  bluebubbles: [
    { key: 'serverUrl', label: 'BlueBubbles server address' },
    { key: 'serverPassword', label: 'BlueBubbles server password', secret: true },
  ],
};

/** These fields edit only newly entered values; saved secrets are never fetched into the form. */
export function ConnectionFields({
  provider,
  value,
  onChange,
}: {
  provider: string;
  value: string;
  onChange: (value: string) => void;
}) {
  let values: Record<string, unknown> = {};
  let invalid = false;
  try {
    const parsed: unknown = value ? JSON.parse(value) : {};
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
      values = parsed as Record<string, unknown>;
    else invalid = true;
  } catch {
    invalid = true;
  }
  return (
    <div className="connection-fields">
      {(connectionFields[provider] ?? []).map((field) => (
        <label key={field.key}>
          {field.label}
          <input
            type={field.secret ? 'password' : 'text'}
            autoComplete="off"
            disabled={invalid}
            maxLength={4000}
            value={typeof values[field.key] === 'string' ? (values[field.key] as string) : ''}
            onChange={(event) =>
              onChange(JSON.stringify({ ...values, [field.key]: event.target.value }))
            }
          />
        </label>
      ))}
      {invalid && (
        <p role="status">
          The advanced value could not be read. Correct it or clear it in Advanced before using
          these fields.
        </p>
      )}
      <small>
        Enter the connection details from your provider account. Save this card to keep them
        securely on this computer.
      </small>
    </div>
  );
}
