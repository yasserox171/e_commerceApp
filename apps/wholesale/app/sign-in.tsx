import {
  ApiRequestError,
  Button,
  Screen,
  ScreenHeader,
  Text,
  TextField,
  useApi,
  useTheme,
} from '@ecommerce/shared-ui';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { APP } from '../config';

type Mode = 'signin' | 'register';

interface FieldErrors {
  email?: string;
  password?: string;
  businessName?: string;
  form?: string;
}

export default function SignInScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { signIn, register } = useApi();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [iceNumber, setIceNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const validate = (): boolean => {
    const next: FieldErrors = {};
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) next.email = 'أدخل بريداً إلكترونياً صالحاً';
    if (password.length < 8) next.password = 'كلمة المرور يجب أن تكون 8 أحرف على الأقل';
    if (mode === 'register' && businessName.trim().length < 2) {
      next.businessName = 'أدخل اسم الشركة أو المحل';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setSubmitting(true);
    setErrors({});

    try {
      if (mode === 'signin') {
        await signIn(email.trim(), password);
      } else {
        await register({
          email: email.trim(),
          password,
          ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          businessName: businessName.trim(),
          ...(iceNumber.trim() ? { iceNumber: iceNumber.trim() } : {}),
        });
      }
      router.back();
    } catch (error) {
      setErrors({
        form:
          error instanceof ApiRequestError
            ? error.message
            : 'تعذر إتمام العملية. حاول مرة أخرى.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Screen>
      <ScreenHeader
        title={mode === 'signin' ? 'تسجيل الدخول' : 'حساب جملة جديد'}
        subtitle={APP.name}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: theme.spacing.lg,
            paddingBottom: theme.spacing.huge,
            gap: theme.spacing.lg,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text variant="body" muted>
            {mode === 'signin'
              ? 'أدخل بيانات حسابك للوصول إلى أسعار الجملة وطلباتك.'
              : 'أنشئ حساباً باسم شركتك للحصول على أسعار الجملة وسلّم الكميات.'}
          </Text>

          <View style={{ gap: theme.spacing.md }}>
            <TextField
              label="البريد الإلكتروني"
              icon="mail-outline"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
              value={email}
              onChangeText={setEmail}
              error={errors.email ?? null}
              placeholder="you@company.ma"
            />

            <TextField
              label="كلمة المرور"
              icon="lock-closed-outline"
              secure
              autoCapitalize="none"
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChangeText={setPassword}
              error={errors.password ?? null}
              {...(mode === 'register' ? { hint: '8 أحرف على الأقل' } : {})}
            />

            {mode === 'register' && (
              <>
                <TextField
                  label="اسم الشركة / المحل"
                  icon="business-outline"
                  value={businessName}
                  onChangeText={setBusinessName}
                  error={errors.businessName ?? null}
                />
                <TextField
                  label="الاسم الكامل (اختياري)"
                  icon="person-outline"
                  value={fullName}
                  onChangeText={setFullName}
                />
                <TextField
                  label="رقم الهاتف (اختياري)"
                  icon="call-outline"
                  keyboardType="phone-pad"
                  value={phone}
                  onChangeText={setPhone}
                  placeholder="+212 6 00 00 00 00"
                />
                <TextField
                  label="رقم ICE (اختياري)"
                  icon="document-text-outline"
                  keyboardType="number-pad"
                  value={iceNumber}
                  onChangeText={setIceNumber}
                  hint="المعرّف الموحد للمقاولة — يظهر على الفاتورة"
                />
              </>
            )}
          </View>

          {errors.form && (
            <View
              style={{
                backgroundColor: theme.colors.dangerSoft,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
              }}
            >
              <Text variant="caption" color={theme.colors.danger}>
                {errors.form}
              </Text>
            </View>
          )}

          <Button
            label={mode === 'signin' ? 'دخول' : 'إنشاء الحساب'}
            size="lg"
            fullWidth
            loading={submitting}
            onPress={() => void submit()}
          />

          <Pressable
            onPress={() => {
              setMode((current) => (current === 'signin' ? 'register' : 'signin'));
              setErrors({});
            }}
            accessibilityRole="button"
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingVertical: theme.spacing.sm })}
          >
            <Text variant="callout" color={theme.colors.primary} align="center">
              {mode === 'signin' ? 'ليس لديك حساب؟ أنشئ حساب جملة' : 'لديك حساب بالفعل؟ سجّل الدخول'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
});
