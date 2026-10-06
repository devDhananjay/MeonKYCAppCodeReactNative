import React from 'react';
import {Modal, Pressable, StyleSheet, Text, View} from 'react-native';

interface Props {
  visible: boolean;
  title?: string;
  /** Plain text content (Flutter `content: Text(...)`). */
  message?: string;
  /** Custom content widget (replaces [message]). */
  children?: React.ReactNode;
  /** Action buttons, rendered right-aligned (Flutter `actions`). */
  actions: React.ReactNode;
  /** Flutter `barrierDismissible` (default true). */
  barrierDismissible?: boolean;
  onRequestClose?: () => void;
  /** Flutter `backgroundColor` (default M3 surfaceContainerHigh). */
  backgroundColor?: string;
  /** Gap between title and content (Flutter `contentPadding.top`). */
  contentGap?: number;
  /** Gap between content and actions (Flutter `contentPadding.bottom`). */
  actionsGap?: number;
}

/** Material 3 `AlertDialog` (surfaceContainerHigh, 28px radius, 24px padding). */
export function AlertDialogView({
  visible,
  title,
  message,
  children,
  actions,
  barrierDismissible = true,
  onRequestClose,
  backgroundColor,
  contentGap,
  actionsGap,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        if (barrierDismissible) onRequestClose?.();
      }}>
      <View style={styles.backdrop}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => {
            if (barrierDismissible) onRequestClose?.();
          }}
        />
        <View style={[styles.dialog, backgroundColor != null ? {backgroundColor} : null]}>
          {title != null ? <Text style={styles.title}>{title}</Text> : null}
          {children != null ? (
            <View style={{marginTop: contentGap ?? (title != null ? 16 : 0)}}>{children}</View>
          ) : message != null ? (
            <Text style={[styles.content, {marginTop: contentGap ?? (title != null ? 16 : 0)}]}>{message}</Text>
          ) : null}
          <View style={[styles.actions, actionsGap != null ? {marginTop: actionsGap} : null]}>{actions}</View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.54)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  dialog: {
    backgroundColor: '#ECE6F0',
    borderRadius: 28,
    padding: 24,
    minWidth: 280,
    maxWidth: 560,
    width: '100%',
  },
  title: {fontSize: 24, color: '#1D1B20'},
  content: {fontSize: 14, color: '#49454F', letterSpacing: 0.25},
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    marginTop: 24,
  },
});
