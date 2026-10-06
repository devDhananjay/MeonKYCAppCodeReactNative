import {CommonActions, createNavigationContainerRef} from '@react-navigation/native';
import {EnvConfig} from '../config/env';
import {splitQueryString} from '../utils/dartHelpers';
import type {RootStackParamList} from './types';

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

type RouteDef = {name: keyof RootStackParamList; params?: any};

/**
 * Resolves a go_router style location (e.g. `/bpwealth/app_test/webview?url=..&title=..`)
 * to a route, exactly like the route table in lib/app.dart (including the redirect for `/`
 * and the errorBuilder -> PageNotFound).
 */
export function resolveLocation(location: string): RouteDef {
  let path = location;
  let query = '';
  const hash = path.indexOf('#');
  if (hash >= 0) path = path.substring(0, hash);
  const q = path.indexOf('?');
  if (q >= 0) {
    query = path.substring(q + 1);
    path = path.substring(0, q);
  }
  // redirect: '/' or empty -> default company/workflow
  if (path === '/' || path.length === 0) {
    path = `/${EnvConfig.companyName}/${EnvConfig.workflowName}`;
  }
  const dec = (s: string): string => {
    try {
      return decodeURIComponent(s);
    } catch (_) {
      return s;
    }
  };
  const segs = path.split('/').filter((s, i) => !(i === 0 && s === '')).map(dec);
  // strip a single trailing empty segment ("/a/b/")
  if (segs.length > 0 && segs[segs.length - 1] === '') segs.pop();
  const qp = splitQueryString(query);

  if (segs.length === 1 && segs[0] === '404') return {name: 'NotFound'};

  if (segs.length === 2) {
    const [company, workflowName] = segs;
    if (company.length === 0 || workflowName.length === 0) return {name: 'NotFound'};
    return {name: 'Home', params: {company, workflowName, queryParams: qp}};
  }
  if (segs.length === 3 && segs[2] === 'webview') {
    const [company, workflowName] = segs;
    const url = qp.url ?? '';
    const title = qp.title ?? 'External Verification';
    if (company.length === 0 || workflowName.length === 0 || url.length === 0) {
      return {name: 'NotFound'};
    }
    return {name: 'WebView', params: {company, workflowName, url, title}};
  }
  if (segs.length === 3 && segs[2] === 'completed') {
    return {
      name: 'Completed',
      params: {
        company: segs[0] || EnvConfig.companyName,
        workflowName: segs[1] || EnvConfig.workflowName,
      },
    };
  }
  return {name: 'NotFound'};
}

/** `GoRouter.go(location)` — replaces the whole stack with the target route. */
export function goTo(location: string): void {
  if (!navigationRef.isReady()) return;
  const route = resolveLocation(location);
  navigationRef.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [{name: route.name as string, params: route.params}],
    }),
  );
}

export function initialRoute(): RouteDef {
  return resolveLocation(`/${EnvConfig.companyName}/${EnvConfig.workflowName}`);
}
