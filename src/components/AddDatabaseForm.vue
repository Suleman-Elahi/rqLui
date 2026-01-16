<template>
  <q-dialog :model-value="modelValue" @update:model-value="$emit('update:modelValue', $event)">
    <q-card style="min-width: 400px">
      <q-card-section>
        <div class="text-h6">Add Database Connection</div>
      </q-card-section>

      <q-card-section>
        <q-form @submit.prevent="handleSubmit" class="q-gutter-md">
          <q-input
            v-model="form.name"
            label="Connection Name"
            hint="A friendly name for this connection"
            :rules="[(v) => !!v || 'Name is required']"
            outlined
            dense
          />

          <q-input
            v-model="form.url"
            label="RQLite URL"
            hint="e.g., http://localhost:4001"
            :rules="[
              (v) => !!v || 'URL is required',
              (v) => isValidUrl(v) || 'Please enter a valid URL',
            ]"
            outlined
            dense
          />

          <div v-if="error" class="text-negative text-caption">
            {{ error }}
          </div>
        </q-form>
      </q-card-section>

      <q-card-actions align="right">
        <q-btn flat label="Cancel" @click="handleCancel" :disable="loading" />
        <q-btn
          color="primary"
          label="Test & Save"
          @click="handleSubmit"
          :loading="loading"
        />
      </q-card-actions>
    </q-card>
  </q-dialog>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import type { DatabaseConnection } from '../types/database';
import { RqliteService } from '../services/rqlite-service';

const props = defineProps<{
  modelValue: boolean;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void;
  (e: 'saved', connection: DatabaseConnection): void;
}>();

const form = reactive({
  name: '',
  url: '',
});

const loading = ref(false);
const error = ref<string | null>(null);

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

function resetForm() {
  form.name = '';
  form.url = '';
  error.value = null;
}

// Reset form when dialog opens
watch(
  () => props.modelValue,
  (isOpen) => {
    if (isOpen) {
      resetForm();
    }
  }
);

async function handleSubmit() {
  if (!form.name || !form.url || !isValidUrl(form.url)) {
    return;
  }

  loading.value = true;
  error.value = null;

  try {
    // Test connection
    const service = new RqliteService(form.url);
    const isConnected = await service.testConnection();

    if (!isConnected) {
      error.value = 'Could not connect to the database. Please check the URL.';
      return;
    }

    // Create connection object
    const connection: DatabaseConnection = {
      id: crypto.randomUUID(),
      name: form.name,
      url: form.url,
      createdAt: Date.now(),
    };

    emit('saved', connection);
    emit('update:modelValue', false);
  } catch (err) {
    error.value = err instanceof Error ? err.message : 'Connection failed';
  } finally {
    loading.value = false;
  }
}

function handleCancel() {
  emit('update:modelValue', false);
}
</script>
