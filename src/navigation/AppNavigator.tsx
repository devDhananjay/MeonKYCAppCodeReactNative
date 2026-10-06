import React from 'react';
import {DefaultTheme, NavigationContainer} from '@react-navigation/native';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import {EnvConfig} from '../config/env';
import {HomePage} from '../pages/HomePage';
import {KycCompletedPage} from '../pages/KycCompletedPage';
import {PageNotFound} from '../pages/PageNotFound';
import {WebViewPage} from '../pages/WebViewPage';
import {KycTheme} from '../theme/kycTheme';
import {initialRoute, navigationRef} from './router';
import type {
  CompletedScreenProps,
  HomeScreenProps,
  NotFoundScreenProps,
  RootStackParamList,
  WebViewScreenProps,
} from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {...DefaultTheme.colors, background: KycTheme.background},
};

/** GoRoute `/:company/:workflowName` */
function HomeScreen({route}: HomeScreenProps) {
  const {company, workflowName, queryParams} = route.params;
  if (company.length === 0 || workflowName.length === 0) {
    return <PageNotFound />;
  }
  return <HomePage company={company} workflowName={workflowName} queryParams={queryParams} />;
}

/** GoRoute `/:company/:workflowName/webview` */
function WebViewScreen({route}: WebViewScreenProps) {
  const {company, workflowName, url, title} = route.params;
  if (company.length === 0 || workflowName.length === 0 || url.length === 0) {
    return <PageNotFound />;
  }
  return <WebViewPage url={url} title={title} company={company} workflowName={workflowName} />;
}

/** GoRoute `/:company/:workflowName/completed` */
function CompletedScreen({route}: CompletedScreenProps) {
  const company = route.params?.company ?? EnvConfig.companyName;
  const workflowName = route.params?.workflowName ?? EnvConfig.workflowName;
  return <KycCompletedPage company={company} workflowName={workflowName} />;
}

/** GoRoute `/404` and go_router `errorBuilder`. */
function NotFoundScreen(_: NotFoundScreenProps) {
  return <PageNotFound />;
}

export function AppNavigator() {
  const init = initialRoute();
  return (
    <NavigationContainer ref={navigationRef} theme={navTheme}>
      <Stack.Navigator
        initialRouteName={init.name}
        screenOptions={{headerShown: false, contentStyle: {backgroundColor: KycTheme.background}}}>
        <Stack.Screen name="Home" component={HomeScreen} initialParams={init.name === 'Home' ? init.params : undefined} />
        <Stack.Screen
          name="WebView"
          component={WebViewScreen}
          // CustomTransitionPage: FadeTransition, 200ms forward / 150ms reverse.
          options={{animation: 'fade', animationDuration: 200}}
        />
        <Stack.Screen name="Completed" component={CompletedScreen} />
        <Stack.Screen name="NotFound" component={NotFoundScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
