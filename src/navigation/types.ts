import type {NativeStackScreenProps} from '@react-navigation/native-stack';

/**
 * Route table mirroring lib/app.dart (go_router):
 *   /:company/:workflowName            -> Home
 *   /:company/:workflowName/webview    -> WebView (?url=&title=)
 *   /:company/:workflowName/completed  -> Completed
 *   /404                               -> NotFound
 */
export type RootStackParamList = {
  Home: {company: string; workflowName: string; queryParams: Record<string, string>};
  WebView: {company: string; workflowName: string; url: string; title: string};
  Completed: {company: string; workflowName: string};
  NotFound: undefined;
};

export type HomeScreenProps = NativeStackScreenProps<RootStackParamList, 'Home'>;
export type WebViewScreenProps = NativeStackScreenProps<RootStackParamList, 'WebView'>;
export type CompletedScreenProps = NativeStackScreenProps<RootStackParamList, 'Completed'>;
export type NotFoundScreenProps = NativeStackScreenProps<RootStackParamList, 'NotFound'>;
