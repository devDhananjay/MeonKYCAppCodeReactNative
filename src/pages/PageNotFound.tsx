import React from 'react';
import {ScrollView, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {GradientView} from '../components/GradientView';

/** Port of lib/pages/page_not_found.dart */
export function PageNotFound() {
  return (
    <GradientView
      style={{flex: 1, width: '100%'}}
      colors={['#E3F2FD' /* blue.shade50 */, '#C5CAE9' /* indigo.shade100 */]}>
      <SafeAreaView style={{flex: 1}}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            alignItems: 'center',
            padding: 24,
          }}>
          <GradientView
            colors={['#AB47BC' /* purple.shade400 */, '#2196F3' /* blue.shade500 */]}
            begin={{x: -1, y: 0}}
            end={{x: 1, y: 0}}
            style={{
              width: 120,
              height: 120,
              borderRadius: 60,
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: '#AB47BC',
              shadowColor: '#000000',
              shadowOpacity: 0.26,
              shadowRadius: 20,
              shadowOffset: {width: 0, height: 10},
              elevation: 10,
            }}>
            <Text style={{fontSize: 36, fontWeight: 'bold', color: '#FFFFFF'}}>404</Text>
          </GradientView>
          <View style={{height: 32}} />
          <Text style={{fontSize: 48, fontWeight: 'bold', color: '#424242'}}>Oops!</Text>
          <View style={{height: 16}} />
          <Text style={{fontSize: 24, fontWeight: '600', color: '#616161'}}>Page Not Found</Text>
          <View style={{height: 12}} />
          <Text style={{fontSize: 16, color: '#757575', lineHeight: 24, textAlign: 'center'}}>
            {"The page you're looking for seems to have wandered off into the digital void."}
          </Text>
          <View style={{height: 32}} />
          <View
            style={{
              padding: 24,
              backgroundColor: 'rgba(255,255,255,0.8)',
              borderRadius: 16,
              shadowColor: '#000000',
              shadowOpacity: 0.05,
              shadowRadius: 10,
              shadowOffset: {width: 0, height: 4},
              elevation: 2,
            }}>
            <Text style={{fontSize: 14, fontStyle: 'italic', color: '#616161'}}>
              {'"Not all who wander are lost, but this page definitely is!"'}
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </GradientView>
  );
}
