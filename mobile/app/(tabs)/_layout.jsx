import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor:   "#2563eb",
        tabBarInactiveTintColor: "#94a3b8",
        tabBarStyle: {
          backgroundColor: "#fff",
          borderTopColor:  "#e2e8f0",
          borderTopWidth:  1,
          paddingTop:      4,
          height:          60,
        },
        tabBarLabelStyle: { fontSize: 12, fontWeight: "600", marginBottom: 4 },
        headerStyle:      { backgroundColor: "#2563eb" },
        headerTintColor:  "#fff",
        headerTitleStyle: { fontWeight: "700", fontSize: 17 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title:    "Goods In",
          tabBarLabel: "Goods In",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="arrow-down-circle-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="complete"
        options={{
          title:    "Goods Out",
          tabBarLabel: "Goods Out",
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="checkmark-circle-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
