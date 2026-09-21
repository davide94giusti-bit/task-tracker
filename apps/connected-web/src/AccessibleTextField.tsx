import { useId } from 'react';
import { TextField as MuiTextField, type TextFieldProps } from '@mui/material';

/** Ensure labels and autofill metadata always target a concrete form field. */
export function AccessibleTextField({ id, name, slotProps, select, ...props }: TextFieldProps) {
  const generatedId = `tt-field-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const fieldId = id || generatedId;
  const fieldName = name || fieldId;
  const labelProps = typeof slotProps?.inputLabel === 'object' ? slotProps.inputLabel : {};
  const selectProps = typeof slotProps?.select === 'object' ? slotProps.select : {};
  const selectInputProps = 'inputProps' in selectProps && typeof selectProps.inputProps === 'object' ? selectProps.inputProps : {};
  const resolvedSlots = select ? {
    ...slotProps,
    // Non-native MUI selects are labelled through aria-labelledby. A for=
    // attribute incorrectly targets their hidden input in Chromium audits.
    inputLabel: { ...labelProps, htmlFor: undefined },
    select: { ...selectProps, inputProps: { ...selectInputProps, id: `${fieldId}-native`, name: fieldName } }
  } : slotProps;
  return <MuiTextField {...props} select={select} id={fieldId} name={fieldName} slotProps={resolvedSlots} />;
}
