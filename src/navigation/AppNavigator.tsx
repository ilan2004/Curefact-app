import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import HomeScreen from '../screens/HomeScreen';
import FactCheckFlow from '../screens/FactCheckFlow';
import LabelCheckFlow from '../screens/LabelCheckFlow';

export type RootStackParamList = {
  Home: undefined;
  FactCheck: undefined;
  LabelCheck: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function AppNavigator() {
  return (
    <Stack.Navigator initialRouteName="Home" screenOptions={{ headerShown: true }}>
      <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'CureFact' }} />
      <Stack.Screen name="FactCheck" component={FactCheckFlow} options={{ title: 'Social Media Check' }} />
      <Stack.Screen name="LabelCheck" component={LabelCheckFlow} options={{ title: 'Product Label Check' }} />
    </Stack.Navigator>
  );
}
