import { useState, useEffect, useCallback } from "react";
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, RefreshControl, Alert,
} from "react-native";
import { api } from "../../lib/api";

function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function isLate(order) {
  if (!order.desiredDeadline || !order.productionEndDate) return false;
  return new Date(order.productionEndDate) > new Date(order.desiredDeadline);
}

export default function GoodsOut() {
  const [orders,     setOrders]    = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [refreshing, setRefreshing]= useState(false);
  const [completing, setCompleting]= useState(null);
  const [success,    setSuccess]   = useState("");

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    try {
      const data = await api.orders.list();
      setOrders(data.filter((o) => o.status === "in_production"));
    } catch (err) {
      Alert.alert("Error loading orders", err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleComplete = (order) => {
    Alert.alert(
      "Complete Order",
      `Mark order #${order.id} — "${order.product.name}" (qty ${order.quantity}) as complete?\n\nThis will move the finished goods into stock.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Complete",
          style: "default",
          onPress: async () => {
            setCompleting(order.id);
            try {
              await api.orders.complete(order.id);
              setSuccess(`Order #${order.id} completed — finished goods added to stock`);
              setTimeout(() => setSuccess(""), 5000);
              await load();
            } catch (err) {
              Alert.alert("Error", err.message);
            } finally {
              setCompleting(null);
            }
          },
        },
      ]
    );
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#2563eb" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {success ? <Text style={styles.successBanner}>{success}</Text> : null}

      <FlatList
        data={orders}
        keyExtractor={(item) => String(item.id)}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor="#2563eb" />
        }
        contentContainerStyle={orders.length === 0 ? styles.emptyContainer : styles.list}
        ListHeaderComponent={
          orders.length > 0 ? (
            <Text style={styles.sectionHeader}>{orders.length} order{orders.length !== 1 ? "s" : ""} in production</Text>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>✅</Text>
            <Text style={styles.emptyTitle}>Nothing in production</Text>
            <Text style={styles.emptyText}>No orders are currently in production.</Text>
            <Text style={styles.emptyHint}>Pull down to refresh.</Text>
          </View>
        }
        renderItem={({ item: order }) => {
          const late = isLate(order);
          return (
            <View style={[styles.card, late && styles.cardLate]}>
              {late && (
                <View style={styles.lateBanner}>
                  <Text style={styles.lateBannerText}>⚠ Behind schedule</Text>
                </View>
              )}
              <View style={styles.cardHeader}>
                <Text style={styles.orderId}>Order #{order.id}</Text>
                <View style={styles.inProductionBadge}>
                  <Text style={styles.inProductionText}>In Production</Text>
                </View>
              </View>

              <Text style={styles.productName}>{order.product.name}</Text>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Customer</Text>
                  <Text style={styles.statValue}>{order.customer?.name ?? "Internal"}</Text>
                </View>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Quantity</Text>
                  <Text style={styles.statValue}>{order.quantity} units</Text>
                </View>
              </View>

              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statLabel}>Production End</Text>
                  <Text style={[styles.statValue, late && { color: "#dc2626" }]}>{fmtDate(order.productionEndDate)}</Text>
                </View>
                {order.desiredDeadline && (
                  <View style={styles.stat}>
                    <Text style={styles.statLabel}>Deadline</Text>
                    <Text style={[styles.statValue, late && { color: "#dc2626" }]}>{fmtDate(order.desiredDeadline)}</Text>
                  </View>
                )}
              </View>

              <TouchableOpacity
                style={[styles.completeBtn, completing === order.id && styles.btnDisabled]}
                onPress={() => handleComplete(order)}
                disabled={completing === order.id}
              >
                {completing === order.id
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.completeBtnText}>✓ Mark as Complete</Text>
                }
              </TouchableOpacity>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: "#f8fafc" },
  centered:        { flex: 1, justifyContent: "center", alignItems: "center" },
  list:            { padding: 16 },
  emptyContainer:  { flexGrow: 1, justifyContent: "center", alignItems: "center", padding: 40 },
  sectionHeader:   { fontSize: 12, fontWeight: "700", color: "#94a3b8", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 12 },

  empty:       { alignItems: "center" },
  emptyIcon:   { fontSize: 56, marginBottom: 16 },
  emptyTitle:  { fontSize: 18, fontWeight: "700", color: "#1e293b", marginBottom: 6 },
  emptyText:   { fontSize: 14, color: "#64748b", textAlign: "center", marginBottom: 4 },
  emptyHint:   { fontSize: 12, color: "#94a3b8" },

  successBanner:   { backgroundColor: "#dcfce7", color: "#15803d", padding: 12, textAlign: "center", fontSize: 13, fontWeight: "600" },

  card:             { backgroundColor: "#fff", borderRadius: 16, padding: 18, marginBottom: 12, shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, elevation: 3, overflow: "hidden" },
  cardLate:         { borderWidth: 1.5, borderColor: "#fca5a5" },
  lateBanner:       { backgroundColor: "#fee2e2", marginHorizontal: -18, marginTop: -18, paddingHorizontal: 18, paddingVertical: 7, marginBottom: 14 },
  lateBannerText:   { fontSize: 12, fontWeight: "700", color: "#dc2626" },
  cardHeader:       { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  orderId:          { fontSize: 13, fontWeight: "700", color: "#94a3b8" },
  inProductionBadge:{ backgroundColor: "#dbeafe", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  inProductionText: { fontSize: 10, fontWeight: "800", color: "#1d4ed8", textTransform: "uppercase", letterSpacing: 0.5 },

  productName:  { fontSize: 20, fontWeight: "800", color: "#1e293b", marginBottom: 14 },
  statsRow:     { flexDirection: "row", gap: 12, marginBottom: 10 },
  stat:         { flex: 1 },
  statLabel:    { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", fontWeight: "600", marginBottom: 3 },
  statValue:    { fontSize: 14, color: "#334155", fontWeight: "700" },

  completeBtn:     { backgroundColor: "#16a34a", borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 6 },
  completeBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  btnDisabled:     { backgroundColor: "#86efac" },
});
