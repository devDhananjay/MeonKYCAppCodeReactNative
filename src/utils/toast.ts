import Toast from 'react-native-toast-message';

export type ToastGravity = 'TOP' | 'CENTER' | 'BOTTOM';

export interface ShowToastOptions {
  msg: string;
  gravity?: ToastGravity;
  /** Toast.LENGTH_LONG when true (default short) */
  long?: boolean;
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
}

/** Equivalent of Fluttertoast.showToast(...). */
export const Fluttertoast = {
  showToast(opts: ShowToastOptions): void {
    const position =
      opts.gravity === 'TOP' ? 'top' : opts.gravity === 'CENTER' ? 'top' : 'bottom';
    Toast.show({
      type: 'kyc',
      text1: opts.msg,
      position,
      visibilityTime: opts.long ? 3500 : 2000,
      topOffset: opts.gravity === 'CENTER' ? 300 : 56,
      bottomOffset: 56,
      props: {
        backgroundColor: opts.backgroundColor,
        textColor: opts.textColor,
        fontSize: opts.fontSize,
      },
    });
  },
  cancel(): void {
    Toast.hide();
  },
};
