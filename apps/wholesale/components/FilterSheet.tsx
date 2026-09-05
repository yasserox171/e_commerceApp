import {
  BottomSheet,
  Button,
  Chip,
  Divider,
  Text,
  TextField,
  formatMAD,
  useFacets,
  useTheme,
  type ProductSort,
} from '@ecommerce/shared-ui';
import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

export interface CatalogFilters {
  supplier?: string;
  subcategory?: string;
  minPrice?: number;
  maxPrice?: number;
  sort: ProductSort;
}

export const DEFAULT_FILTERS: CatalogFilters = { sort: 'newest' };

export function countActiveFilters(filters: CatalogFilters): number {
  let count = 0;
  if (filters.supplier) count += 1;
  if (filters.subcategory) count += 1;
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) count += 1;
  if (filters.sort !== 'newest') count += 1;
  return count;
}

const SORT_OPTIONS: Array<{ value: ProductSort; label: string }> = [
  { value: 'newest', label: 'الأحدث' },
  { value: 'price_asc', label: 'الأرخص أولاً' },
  { value: 'price_desc', label: 'الأغلى أولاً' },
  { value: 'title', label: 'أبجدياً' },
];

export interface FilterSheetProps {
  visible: boolean;
  onClose: () => void;
  filters: CatalogFilters;
  onApply: (filters: CatalogFilters) => void;
  search?: string;
}

/**
 * Filters live in a bottom sheet with a draft copy of the state: nothing is
 * applied until "تطبيق" is tapped, so a mistaken tap does not re-fetch the
 * whole catalogue. Facet counts come from the server, so a filter that would
 * return nothing is never offered.
 */
export function FilterSheet({ visible, onClose, filters, onApply, search }: FilterSheetProps) {
  const theme = useTheme();
  const { data: facets, isLoading } = useFacets(search);
  const [draft, setDraft] = useState<CatalogFilters>(filters);

  // Re-seed the draft each time the sheet opens so it always reflects what is
  // actually applied, not what was abandoned last time.
  useEffect(() => {
    if (visible) setDraft(filters);
  }, [visible, filters]);

  const toggle = <K extends 'supplier' | 'subcategory'>(key: K, value: string) => {
    setDraft((current) => ({ ...current, [key]: current[key] === value ? undefined : value }));
  };

  const setPrice = (key: 'minPrice' | 'maxPrice', raw: string) => {
    const parsed = Number.parseFloat(raw.replace(',', '.'));
    setDraft((current) => ({
      ...current,
      [key]: raw.trim() === '' || !Number.isFinite(parsed) ? undefined : parsed,
    }));
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="تصفية النتائج"
      footer={
        <View style={[styles.footer, { gap: theme.spacing.md }]}>
          <Button
            label="مسح الكل"
            variant="outline"
            onPress={() => setDraft(DEFAULT_FILTERS)}
            style={{ flex: 1 }}
          />
          <Button
            label="تطبيق"
            onPress={() => {
              onApply(draft);
              onClose();
            }}
            style={{ flex: 2 }}
          />
        </View>
      }
    >
      <Section title="الترتيب">
        <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
          {SORT_OPTIONS.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={draft.sort === option.value}
              onPress={() => setDraft((current) => ({ ...current, sort: option.value }))}
            />
          ))}
        </View>
      </Section>

      <Divider />

      <Section title="المورّد">
        {isLoading ? (
          <Text variant="caption" muted>
            جارٍ تحميل الموردين…
          </Text>
        ) : facets && facets.suppliers.length > 0 ? (
          <ScrollView style={styles.facetList} nestedScrollEnabled>
            <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
              {facets.suppliers.map((supplier) => (
                <Chip
                  key={supplier.value}
                  label={supplier.value}
                  count={supplier.count}
                  selected={draft.supplier === supplier.value}
                  onPress={() => toggle('supplier', supplier.value)}
                />
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text variant="caption" muted>
            لا توجد بيانات موردين لهذه المنتجات.
          </Text>
        )}
      </Section>

      <Divider />

      <Section title="الفئة">
        {facets && facets.subcategories.length > 0 ? (
          <ScrollView style={styles.facetList} nestedScrollEnabled>
            <View style={[styles.wrap, { gap: theme.spacing.sm }]}>
              {facets.subcategories.map((entry) => (
                <Chip
                  key={entry.value}
                  label={entry.value}
                  count={entry.count}
                  selected={draft.subcategory === entry.value}
                  onPress={() => toggle('subcategory', entry.value)}
                />
              ))}
            </View>
          </ScrollView>
        ) : (
          <Text variant="caption" muted>
            لا توجد فئات فرعية لهذه المنتجات.
          </Text>
        )}
      </Section>

      <Divider />

      <Section
        title="نطاق السعر"
        hint={
          facets?.priceRange
            ? `المتاح: ${formatMAD(facets.priceRange.min)} — ${formatMAD(facets.priceRange.max)}`
            : undefined
        }
      >
        <View style={[styles.row, { gap: theme.spacing.md }]}>
          <TextField
            label="من"
            keyboardType="decimal-pad"
            placeholder={facets?.priceRange ? String(Math.floor(facets.priceRange.min)) : '0'}
            value={draft.minPrice?.toString() ?? ''}
            onChangeText={(value) => setPrice('minPrice', value)}
            containerStyle={{ flex: 1 }}
          />
          <TextField
            label="إلى"
            keyboardType="decimal-pad"
            placeholder={facets?.priceRange ? String(Math.ceil(facets.priceRange.max)) : '∞'}
            value={draft.maxPrice?.toString() ?? ''}
            onChangeText={(value) => setPrice('maxPrice', value)}
            containerStyle={{ flex: 1 }}
          />
        </View>
      </Section>
    </BottomSheet>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.sm, paddingVertical: theme.spacing.xs }}>
      <Text variant="h3">{title}</Text>
      {hint && (
        <Text variant="micro" muted>
          {hint}
        </Text>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  row: {
    flexDirection: 'row',
  },
  footer: {
    flexDirection: 'row',
  },
  facetList: {
    maxHeight: 168,
  },
});
