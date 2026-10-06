import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import Toast, {ToastConfig} from 'react-native-toast-message';

/** Mimics the look of Fluttertoast (rounded dark pill with white text). */
const toastConfig: ToastConfig = {
  kyc: ({text1, props}) => (
    <View
      style={[
        styles.container,
        {backgroundColor: props?.backgroundColor ?? 'rgba(50,50,50,0.95)'},
      ]}>
      <Text
        style={[
          styles.text,
          {
            color: props?.textColor ?? '#FFFFFF',
            fontSize: props?.fontSize ?? 14,
          },
        ]}>
        {text1}
      </Text>
    </View>
  ),
};

export default function AppToast() {
  return <Toast config={toastConfig} />;
}

const styles = StyleSheet.create({
  container: {
    maxWidth: '90%',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 25,
  },
  text: {
    textAlign: 'center',
  },
});
