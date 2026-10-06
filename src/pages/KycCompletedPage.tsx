import React, {useEffect, useRef, useState} from 'react';
import {Pressable, ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {AlertDialogView} from '../components/AlertDialogView';
import {MaterialIcon} from '../components/MaterialIcon';
import {TextButton} from '../components/MaterialButtons';
import {goTo} from '../navigation/router';
import {StorageService} from '../services/storageService';
import {useAppStore} from '../store/appStore';
import {KycTheme} from '../theme/kycTheme';
import {debugPrint} from '../utils/debug';
import {isMap, toStr, toStrOrNull} from '../utils/dartHelpers';

interface Props {
  company: string;
  workflowName: string;
}

/** Port of lib/pages/kyc_completed_page.dart */
export function KycCompletedPage({company: widgetCompany, workflowName: widgetWorkflow}: Props) {
  const store = useAppStore();
  const mountedRef = useRef(true);
  const [logoutVisible, setLogoutVisible] = useState(false);

  useEffect(() => {
    mountedRef.current = true;
    // WidgetsBinding.addPostFrameCallback -> _loadStepperData()
    const t = setTimeout(() => loadStepperData(), 0);
    return () => {
      mountedRef.current = false;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadStepperData(): void {
    let workflowId: string | null = null;
    let currentPosition: string | null = null;
    const userDetails = store.userDetails;

    // Extract workflowId from design_template in fieldsWithAuth (same as home_page)
    const fieldsWithAuth = store.fieldsWithAuth;
    if (isMap(fieldsWithAuth)) {
      const contextData = isMap(fieldsWithAuth.context) ? fieldsWithAuth.context : null;
      const designTemplate = toStrOrNull(contextData?.design_template);
      if (designTemplate != null && designTemplate.includes('-')) {
        const parts = designTemplate.split('-');
        if (parts.length >= 2) {
          workflowId = parts[1]; // Second part is workflowId
          debugPrint(`[KycCompletedPage] Extracted workflowId from design_template: ${workflowId}`);
        }
      }

      // Get position (already stored in AppStore, but keep for reference)
      currentPosition = store.currentPosition;
    }

    // Fallback: try user details if workflowId not found
    if ((workflowId == null || workflowId.length === 0) && isMap(userDetails)) {
      const data = isMap(userDetails.data) ? userDetails.data : null;
      workflowId =
        toStrOrNull(data?.workflow_id) ?? toStrOrNull(data?.id) ?? toStrOrNull(userDetails.workflow_id);
    }

    // Get company and workflowName from store
    const company = store.company ?? 'mandotsecurities';
    const workflowName = store.workflowName ?? 'bp_flow';

    debugPrint(
      `[KycCompletedPage] Stepper data - company: ${company}, workflowName: ${workflowName}, workflowId: ${workflowId}, position: ${currentPosition}`,
    );

    // Fetch stepper workflow if we have workflowId and it's not already loaded
    if (workflowId != null && workflowId.length > 0) {
      if (store.stepperWorkflow == null && !store.loadingStepperWorkflow) {
        debugPrint(`[KycCompletedPage] Fetching stepper workflow: ${workflowName} / ${workflowId}`);
        // Backend route: /kycadmin_getWorkflow/{workflowName}/{workflowId}
        store.fetchStepperWorkflow(workflowName, workflowId);
      }
    } else {
      debugPrint(
        `[KycCompletedPage] Missing workflowId or company. workflowId: ${workflowId}, company: ${company}`,
      );
    }
  }

  async function confirmLogout(): Promise<void> {
    setLogoutVisible(false);
    await StorageService.clearAll();
    // Post-logout: SSO-only login on HomePage (_loadWorkflow auto-SSO).
    StorageService.setSsoAutoLoginEnabled(true);
    if (!mountedRef.current) return;
    store.resetState();
    goTo(`/${widgetCompany}/${widgetWorkflow}`);
  }

  const userDetails = store.userDetails;

  // Extract user details from API response
  const response = isMap(userDetails) ? userDetails : null;
  const data = response != null && isMap(response.data) ? response.data : null;

  const name = toStrOrNull(data?.aadhar_name) ?? 'N/A';
  const pan = toStrOrNull(data?.temp_pan_no) ?? 'N/A';
  const phone = toStrOrNull(data?.change_mobile) ?? toStrOrNull(data?.mobile_number) ?? 'N/A';
  const aadhaar = toStrOrNull(data?.aadhar_no) ?? '';
  const maskedAadhaar =
    aadhaar.length > 0 && aadhaar.length >= 4
      ? `XXXX-XXXX-${aadhaar.substring(aadhaar.length - 4)}`
      : 'N/A';

  const completedSteps = getCompletedSteps(data);

  return (
    <SafeAreaView style={{flex: 1, backgroundColor: '#FFFFFF'}}>
      <View style={{flex: 1}}>
        <View style={{flex: 1}}>
          {/* Main content */}
          <ScrollView contentContainerStyle={{padding: 24}}>
            <View style={{alignItems: 'center'}}>
              <View style={{height: 20}} />
              {/* Success indicator with rings */}
              <View style={{width: 120, height: 120, alignItems: 'center', justifyContent: 'center'}}>
                {/* Outer ring */}
                <View
                  style={{
                    position: 'absolute',
                    width: 120,
                    height: 120,
                    borderRadius: 60,
                    backgroundColor: 'rgba(76,175,80,0.1)',
                  }}
                />
                {/* Middle ring */}
                <View
                  style={{
                    position: 'absolute',
                    width: 100,
                    height: 100,
                    borderRadius: 50,
                    backgroundColor: 'rgba(76,175,80,0.15)',
                  }}
                />
                {/* Inner circle with checkmark */}
                <View
                  style={{
                    width: 80,
                    height: 80,
                    borderRadius: 40,
                    backgroundColor: '#4CAF50',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <MaterialIcon name="check" size={50} color="#FFFFFF" />
                </View>
              </View>
              <View style={{height: 25}} />
              {/* KYC Completed heading */}
              <Text style={{fontSize: 26, fontWeight: 'bold', color: '#000000'}}>KYC Completed</Text>
              <View style={{height: 10}} />
              {/* Verification message */}
              <Text style={{fontSize: 15, color: '#757575'}}>Your account will be verified in 48 hr</Text>
              <View style={{height: 40}} />
            </View>

            {/* Customer Details card */}
            <View style={{padding: 20, backgroundColor: '#F5F5F5', borderRadius: 12}}>
              <Text style={{fontSize: 17, fontWeight: 'bold', color: '#000000'}}>Customer Details</Text>
              <View style={{height: 12}} />
              <View style={{flexDirection: 'row', alignItems: 'flex-start'}}>
                <View style={{flex: 1}}>
                  <DetailRow label="Name" value={name} />
                  <View style={{height: 10}} />
                  <DetailRow label="Pan" value={pan} />
                </View>
                <View style={{width: 24}} />
                <View style={{flex: 1}}>
                  <DetailRow label="Phone" value={phone} />
                  <View style={{height: 10}} />
                  <DetailRow label="Aadhaar" value={maskedAadhaar} />
                </View>
              </View>
            </View>
            <View style={{height: 32}} />
            {/* Completed Steps section */}
            <Text style={{fontSize: 17, fontWeight: 'bold', color: '#000000'}}>Completed Steps</Text>
            <View style={{height: 14}} />
            {/* Steps list */}
            {completedSteps.map((step, i) => (
              <View key={`${i}-${step}`} style={{flexDirection: 'row', alignItems: 'center', marginBottom: 10}}>
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: '#4CAF50',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                  <MaterialIcon name="check" size={16} color="#FFFFFF" />
                </View>
                <View style={{width: 12}} />
                <Text style={{flex: 1, fontSize: 14, color: '#000000'}}>{step}</Text>
              </View>
            ))}
            <View style={{height: 40}} />
          </ScrollView>
        </View>

        <View style={{position: 'absolute', top: 0, right: 0, padding: 8}}>
          <Pressable
            onPress={() => setLogoutVisible(true)}
            style={{width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}}>
            <MaterialIcon name="logout" size={24} color={KycTheme.textPrimary} />
          </Pressable>
        </View>
      </View>

      <AlertDialogView
        visible={logoutVisible}
        title="Logout"
        message="Are you sure you want to logout?"
        onRequestClose={() => setLogoutVisible(false)}
        actions={
          <>
            <TextButton label="Cancel" paddingHorizontal={12} paddingVertical={10} onPress={() => setLogoutVisible(false)} />
            <View style={{width: 8}} />
            <TextButton label="Logout" paddingHorizontal={12} paddingVertical={10} onPress={() => void confirmLogout()} />
          </>
        }
      />
    </SafeAreaView>
  );
}

function DetailRow({label, value}: {label: string; value: string}) {
  return (
    <View>
      <Text style={{fontSize: 14, color: '#757575', fontWeight: '500'}}>{label}</Text>
      <View style={{height: 4}} />
      <Text style={{fontSize: 14, color: '#000000', fontWeight: '600'}}>{value}</Text>
    </View>
  );
}

function getCompletedSteps(data: Record<string, any> | null): string[] {
  // Default steps - can be customized based on API response
  const steps = [
    'Mobile and Email Verification',
    'Brokerage Plan Selected',
    'Pan Verified',
    'Aadhaar Verification',
    'Photo Verification',
    'Other Details Filled',
    'Bank Details Submitted',
    'E-Sign Done',
  ];

  // If API provides steps list, use that instead
  if (data != null && Array.isArray(data.completed_steps)) {
    return data.completed_steps.map((e: unknown) => toStr(e));
  }

  return steps;
}
