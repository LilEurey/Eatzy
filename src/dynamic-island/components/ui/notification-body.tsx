import { PALETTE } from "@/dynamic-island/conf/palette";
import { useDynamicNotifications } from "@/dynamic-island/hooks/use-dynamic-notifications";
import type { INotificationBody } from "@/dynamic-island/interfaces/notification-content.interface";
import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

// No per-notification avatar: show the Eatzy app icon in the circle.
const APP_ICON = require("../../../../assets/images/icon.png");

const NotificationBody: React.FC<INotificationBody> &
  React.FunctionComponent<INotificationBody> = memo<INotificationBody>(
  ({
    notification,
  }: INotificationBody):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const context = useDynamicNotifications();
    const accent = notification.accent ?? context.accent;

    return (
      <View style={styles.body}>
        <Image
          source={notification.avatar ? { uri: notification.avatar } : APP_ICON}
          style={styles.avatar}
          contentFit="cover"
          transition={180}
          cachePolicy="memory-disk"
        />

        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.title, { color: accent }]}>
            {notification.title}
          </Text>
          {notification.message ? (
            <Text numberOfLines={1} style={styles.message}>
              {notification.message}
            </Text>
          ) : null}
        </View>

        {notification.symbol ? (
          <SymbolView
            name={notification.symbol}
            size={27}
            tintColor={accent}
            weight="semibold"
            fallback={null}
          />
        ) : null}
      </View>
    );
  },
);

const styles = StyleSheet.create({
  body: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 13,
    paddingRight: 20,
    gap: 12,
  },
  avatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: PALETTE.avatar,
  },
  copy: {
    flex: 1,
  },
  title: {
    fontSize: 17,
    fontWeight: "700",
    letterSpacing: -0.35,
  },
  message: {
    marginTop: 1,
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: -0.2,
    color: PALETTE.message,
  },
});

export { NotificationBody };
