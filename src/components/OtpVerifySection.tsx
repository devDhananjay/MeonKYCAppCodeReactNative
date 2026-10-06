import React, {useCallback, useEffect, useRef, useState} from 'react';
import {ActivityIndicator, Pressable, Text, View} from 'react-native';
import {KycTheme, withOpacity} from '../theme/kycTheme';
import {AnyMap, intTryParse} from '../utils/dartHelpers';
import {LoadingButton} from './LoadingButton';
import {OtpInput, OtpInputSixBoxes} from './OtpInput';

/** Minimum OTP digits required to enable Verify (email & phone both) */
const minOtpLength = 6;

function formatMmSs(seconds: number): string {
  const m = Math.trunc(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * Resend cooldown driven by API `otpExpiry.time` (seconds). Re-initialises whenever the
 * `otpExpiry` object identity changes (same as Flutter's `oldWidget.otpExpiry != widget.otpExpiry`).
 */
function useResendCooldown(otpExpiry: AnyMap | null | undefined) {
  const [remaining, setRemaining] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current != null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    clearTimer();
    setRemaining(0);
    setEnabled(false);

    const expiry = otpExpiry;
    if (expiry == null) return;
    if (expiry.isExpiryEnabled === false) return;

    const resendSec = intTryParse(expiry.time == null ? '0' : String(expiry.time)) ?? 0;
    if (resendSec <= 0) return;

    setEnabled(true);
    setRemaining(resendSec);
    timerRef.current = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearTimer();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return clearTimer;
  }, [otpExpiry, clearTimer]);

  return {remaining, enabled};
}

function ResendRow({
  remaining,
  enabled,
  resendLoading,
  onResendOtp,
}: {
  remaining: number;
  enabled: boolean;
  resendLoading: boolean;
  onResendOtp?: (() => void) | null;
}) {
  const canResend = onResendOtp != null && (!enabled || remaining === 0);
  const small = {fontSize: 13, color: KycTheme.textSecondary};
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center'}}>
      <Text style={small}>{"Didn't receive OTP? "}</Text>
      {resendLoading ? (
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          <View style={{width: 12, height: 12, alignItems: 'center', justifyContent: 'center'}}>
            <ActivityIndicator size="small" color={KycTheme.primary} style={{transform: [{scale: 0.6}]}} />
          </View>
          <View style={{width: 6}} />
          <Text style={small}>Resending...</Text>
        </View>
      ) : remaining > 0 ? (
        <Text style={small}>{`Resend OTP in ${formatMmSs(remaining)}`}</Text>
      ) : canResend ? (
        <Pressable onPress={onResendOtp ?? undefined}>
          <Text
            style={{
              fontSize: 13,
              fontWeight: '600',
              color: KycTheme.primary,
              textDecorationLine: 'underline',
            }}>
            Resend OTP
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

interface OtpVerifySectionProps {
  /** e.g. "We have sent you an OTP via sms on +91 9291929192" */
  sentToText: string;
  onEdit?: (() => void) | null;
  onVerify: (otp: string) => void;
  onResendOtp?: (() => void) | null;
  /** OTP config from API: {time, isExpiryEnabled, ...} - only `time` drives resend countdown. */
  otpExpiry?: AnyMap | null;
  verifyLoading?: boolean;
  resendLoading?: boolean;
  otpLength?: number;
  /** When true, show 6 separate OTP boxes (email_otp); when false, single field (mobile_otp) */
  useSixBoxes?: boolean;
}

/** OTP verify block: instruction + Edit, OTP input, resend cooldown, Verify. */
export function OtpVerifySection({
  sentToText,
  onEdit,
  onVerify,
  onResendOtp,
  otpExpiry,
  verifyLoading = false,
  resendLoading = false,
  otpLength = 6,
  useSixBoxes = false,
}: OtpVerifySectionProps) {
  const [otp, setOtp] = useState('');
  const {remaining, enabled} = useResendCooldown(otpExpiry);

  return (
    <View style={{alignSelf: 'stretch'}}>
      <View style={{flexDirection: 'row', alignItems: 'baseline'}}>
        <Text style={{flex: 1, fontSize: 14, color: KycTheme.textPrimary}}>{sentToText}</Text>
        {onEdit != null ? (
          <Pressable onPress={onEdit}>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '600',
                color: KycTheme.primary,
                textDecorationLine: 'underline',
              }}>
              Edit
            </Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{height: 20}} />
      {useSixBoxes ? (
        <OtpInputSixBoxes length={otpLength} onChanged={v => setOtp(v)} onComplete={v => setOtp(v)} />
      ) : (
        <OtpInput length={otpLength} onChanged={v => setOtp(v)} onComplete={v => setOtp(v)} />
      )}
      <View style={{height: 16}} />
      <ResendRow remaining={remaining} enabled={enabled} resendLoading={resendLoading} onResendOtp={onResendOtp} />
      <View style={{height: 24}} />
      <LoadingButton
        onPressed={otp.length < minOtpLength ? null : () => onVerify(otp)}
        isLoading={verifyLoading}
        label="Verify"
        loadingLabel="Verifying..."
        height={54}
        style={{
          backgroundColor: KycTheme.primary,
          disabledBackgroundColor: withOpacity(KycTheme.primary, 0.5),
          borderRadius: 12,
        }}
      />
    </View>
  );
}

OtpVerifySection.minOtpLength = minOtpLength;

interface OtpResendControlsProps {
  otpExpiry?: AnyMap | null;
  onResendOtp?: (() => void) | null;
  resendLoading?: boolean;
}

/** Resend OTP link + 3 min cooldown (nominee opt-out uses normal form + this bar). */
export function OtpResendControls({otpExpiry, onResendOtp, resendLoading = false}: OtpResendControlsProps) {
  const {remaining, enabled} = useResendCooldown(otpExpiry);
  return <ResendRow remaining={remaining} enabled={enabled} resendLoading={resendLoading} onResendOtp={onResendOtp} />;
}
