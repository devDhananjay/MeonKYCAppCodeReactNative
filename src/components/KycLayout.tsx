import React from 'react';
import {ScrollView, StatusBar, Text, View, Image} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {KycTheme} from '../theme/kycTheme';
import {AppAssets} from '../utils/assets';
import {DocumentsHandySection} from './DocumentsHandySection';

interface KycLayoutProps {
  children?: React.ReactNode;
  title?: string | null;
  stepperSteps?: string[] | null;
  stepperIndex?: number | null;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
  showDocumentsSection?: boolean;
  /** When true, skip Scaffold/SafeArea (for nested use) */
  skipScaffold?: boolean;
}

function isStartKycTitle(title: string | null | undefined): boolean {
  if (title == null) return false;
  const lower = title.toLowerCase();
  return lower.includes('start your kyc') && lower.includes('pickup where you left off');
}

/**
 * Builds the page title section.
 * Special handling for the "Start your KYC" hero title from Figma:
 * first line bold 24, second line subtitle 14.
 */
function TitleSection() {
  return (
    <View style={{alignItems: 'flex-start'}}>
      <Text style={{fontSize: 24, fontWeight: '700', color: KycTheme.textPrimary}}>Start your KYC</Text>
      <View style={{height: 4}} />
      <Text style={{fontSize: 14, fontWeight: '400', color: KycTheme.textSecondary}}>
        or pickup where you left off
      </Text>
    </View>
  );
}

function TopBar({leading, trailing}: {leading?: React.ReactNode; trailing?: React.ReactNode}) {
  // If nothing to show, avoid taking vertical space
  if (leading == null && trailing == null) return null;
  return (
    <View
      style={{
        paddingLeft: KycTheme.spacingXl,
        paddingTop: KycTheme.spacingSm,
        paddingRight: KycTheme.spacingXl,
        paddingBottom: KycTheme.spacingXs,
        flexDirection: 'row',
        alignItems: 'center',
      }}>
      {leading != null ? leading : null}
      <View style={{flex: 1}} />
      {trailing != null ? trailing : null}
    </View>
  );
}

/** KYC screen layout from Figma: logo, optional stepper, content, documents section */
export function KycLayout({
  children,
  title,
  leading,
  trailing,
  showDocumentsSection = true,
  skipScaffold = false,
}: KycLayoutProps) {
  let content: React.ReactNode;
  if (skipScaffold) {
    // When skipping scaffold, return scrollable content directly (no Expanded)
    const isFirstStep = isStartKycTitle(title);
    content = (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingLeft: KycTheme.spacingXl,
          paddingTop: KycTheme.spacingLg,
          paddingRight: KycTheme.spacingXl,
          paddingBottom: isFirstStep ? KycTheme.spacing3xl : KycTheme.spacingLg,
        }}>
        <View style={{maxWidth: 480, alignSelf: 'stretch'}}>
          {isFirstStep ? (
            <>
              <View style={{flexDirection: 'row', justifyContent: 'center'}}>
                <Image
                  source={AppAssets.stoxboxLogo}
                  style={{height: 88, width: 133, borderRadius: 12}}
                  resizeMode="contain"
                />
              </View>
              <View style={{height: 24}} />
            </>
          ) : null}
          {title != null ? (
            <>
              <View style={{height: 20}} />
              {isFirstStep ? (
                <TitleSection />
              ) : (
                <Text style={{fontSize: 22, fontWeight: '700', color: KycTheme.textPrimary}}>{title}</Text>
              )}
              <View style={{height: 16}} />
            </>
          ) : null}
          {children}
          {showDocumentsSection ? (
            <>
              <View style={{height: 24}} />
              <DocumentsHandySection />
            </>
          ) : null}
        </View>
      </ScrollView>
    );
    return <>{content}</>;
  }

  // Default: full layout with Expanded
  content = (
    <View style={{flex: 1}}>
      {/* Top bar: minimal header (logout/back aligned right) */}
      <TopBar leading={leading} trailing={trailing} />
      {/* Stepper (hidden temporarily) - re-enable via stepperSteps / stepperIndex props. */}
      <ScrollView
        style={{flex: 1}}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          paddingHorizontal: KycTheme.spacingXl,
          paddingVertical: KycTheme.spacingLg,
        }}>
        <View style={{maxWidth: 480, alignSelf: 'stretch'}}>
          {title != null ? (
            <>
              {isStartKycTitle(title) ? (
                <TitleSection />
              ) : (
                <Text style={{fontSize: KycTheme.fontSizeTitle, fontWeight: '700', color: KycTheme.textPrimary}}>
                  {title}
                </Text>
              )}
              <View style={{height: KycTheme.spacingSm}} />
            </>
          ) : null}
          {children}
          {showDocumentsSection ? (
            <>
              <View style={{height: KycTheme.spacing2xl}} />
              <DocumentsHandySection />
            </>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );

  // Default: wrap in Scaffold and SafeArea
  return (
    <View style={{flex: 1, backgroundColor: KycTheme.background}}>
      <StatusBar barStyle={KycTheme.statusBar.barStyle} />
      <SafeAreaView style={{flex: 1}}>{content}</SafeAreaView>
    </View>
  );
}
