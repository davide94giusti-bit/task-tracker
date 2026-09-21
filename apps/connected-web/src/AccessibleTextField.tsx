import { useId } from 'react';
import { TextField as MuiTextField, type TextFieldProps } from '@mui/material';

/** Ensure labels and autofill metadata always target a concrete form field. */
export function AccessibleTextField({ id, name, ...props }: TextFieldProps) {
  const generatedId = `tt-field-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fieldId = id || generatedId;
  return <MuiTextField {...props} id={fieldId} name={name || fieldId} />;
}
