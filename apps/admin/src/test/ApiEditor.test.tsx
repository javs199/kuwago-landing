import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {it,expect,vi} from 'vitest';
import {PriceAmountField} from '../features/services/ApiServiceEditor';
import {PreferencesProvider} from '../preferences';
it('allows decimal typing without dropping the decimal separator or silently rounding invalid prices',async()=>{
  const user=userEvent.setup(),change=vi.fn();render(<PreferencesProvider><PriceAmountField label="Importe" initialMinor={0} onChange={change}/></PreferencesProvider>);
  const input=screen.getByLabelText('Importe');await user.clear(input);await user.type(input,'12.34');expect(input).toHaveValue('12.34');expect(change).toHaveBeenLastCalledWith(1234);expect(input).toHaveAttribute('aria-invalid','false');
  await user.type(input,'5');expect(input).toHaveValue('12.345');expect(change).toHaveBeenLastCalledWith(NaN);expect(input).toHaveAttribute('aria-invalid','true');
  await user.clear(input);expect(change).toHaveBeenLastCalledWith(NaN);
});
